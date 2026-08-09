import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'
import { normalizeExternalHttpUrl } from '@/lib/safe-url'
import { WIIM_SUMMARY_CONFIG_VERSION } from '@/lib/wiim-summary-config'

export const STOCK_CATALYST_HISTORY_QUERY_LIMIT = 48
export const STOCK_CATALYST_HISTORY_ITEM_LIMIT = 10
export const STOCK_CATALYST_HISTORY_TIMEOUT_MS = 4_000

const MAX_SUMMARY_LENGTH = 600
const MAX_KEY_FACT_LENGTH = 320
const MAX_SOURCE_TITLE_LENGTH = 320
const MAX_SOURCE_PUBLISHER_LENGTH = 120
const MAX_SOURCE_URL_LENGTH = 2_048
const MAX_TIMESTAMP_LENGTH = 64
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const REASON_TYPES = new Set([
  'earnings',
  'analyst_action',
  'macro',
  'deal',
  'product',
  'legal',
  'capital_return',
  'management',
  'price_action',
  'other',
  'unclear',
])

export interface StockCatalystHistorySource {
  title: string
  publisher: string | null
  publishedAt: string | null
  url: string
}

export interface StockCatalystHistoryItem {
  summaryDate: string
  summaryText: string
  keyFact: string | null
  reasonType: string | null
  movePercent: number | null
  generatedAt: string
  source: StockCatalystHistorySource | null
}

export type StockCatalystHistoryUnavailableReason =
  | 'configuration'
  | 'invalid_data'
  | 'query'
  | 'timeout'

export type StockCatalystHistoryResult =
  | {
      status: 'ready'
      items: StockCatalystHistoryItem[]
    }
  | {
      status: 'empty'
      items: []
    }
  | {
      status: 'unavailable'
      reason: StockCatalystHistoryUnavailableReason
      items: []
    }

interface LoadStockCatalystHistoryOptions {
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function normalizedTimestamp(value: unknown): string | null {
  const normalized = boundedText(value, MAX_TIMESTAMP_LENGTH)
  if (!normalized) return null
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function nullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= 10_000
    ? value
    : null
}

function mapSource(value: unknown): StockCatalystHistorySource | null {
  if (!isRecord(value)) return null

  const title = boundedText(value.title, MAX_SOURCE_TITLE_LENGTH)
  const rawUrl = boundedText(value.url, MAX_SOURCE_URL_LENGTH)
  const url = rawUrl ? normalizeExternalHttpUrl(rawUrl) : null
  if (!title || !url) return null

  return {
    title,
    publisher: boundedText(value.publisher, MAX_SOURCE_PUBLISHER_LENGTH),
    publishedAt: normalizedTimestamp(value.publishedDate),
    url,
  }
}

function mapRow(
  value: unknown,
  expectedSymbol: string,
): StockCatalystHistoryItem | null {
  if (!isRecord(value)) return null
  if (
    typeof value.symbol !== 'string' ||
    normalizeMarketSymbol(value.symbol) !== expectedSymbol ||
    value.config_version !== WIIM_SUMMARY_CONFIG_VERSION ||
    value.no_summary_reason === 'validation_rejected'
  ) {
    return null
  }

  const summaryDate = value.summary_date
  const summaryText = boundedText(value.summary_text, MAX_SUMMARY_LENGTH)
  const generatedAt = normalizedTimestamp(value.generated_at)
  if (!isCalendarDate(summaryDate) || !summaryText || !generatedAt) return null

  const metadata = isRecord(value.metadata) ? value.metadata : null
  const quote = metadata && isRecord(metadata.quote) ? metadata.quote : null
  const rawReasonType = boundedText(metadata?.reason_type, 64)

  return {
    summaryDate,
    summaryText,
    keyFact: boundedText(metadata?.key_fact, MAX_KEY_FACT_LENGTH),
    reasonType:
      rawReasonType && REASON_TYPES.has(rawReasonType)
        ? rawReasonType
        : null,
    movePercent: nullableFiniteNumber(quote?.changesPercentage),
    generatedAt,
    source: mapSource(value.winning_event),
  }
}

export function mapStockCatalystHistoryRows(
  value: unknown,
  expectedSymbol: string,
): StockCatalystHistoryItem[] | null {
  if (!Array.isArray(value)) return null

  const normalizedSymbol = normalizeMarketSymbol(expectedSymbol)
  if (!isValidStockPageSymbol(normalizedSymbol)) return null

  const latestByDate = new Map<string, StockCatalystHistoryItem>()
  for (const row of value.slice(0, STOCK_CATALYST_HISTORY_QUERY_LIMIT)) {
    const mapped = mapRow(row, normalizedSymbol)
    if (!mapped) continue

    const current = latestByDate.get(mapped.summaryDate)
    if (!current || mapped.generatedAt > current.generatedAt) {
      latestByDate.set(mapped.summaryDate, mapped)
    }
  }

  return Array.from(latestByDate.values())
    .sort((left, right) =>
      right.summaryDate.localeCompare(left.summaryDate) ||
      right.generatedAt.localeCompare(left.generatedAt),
    )
    .slice(0, STOCK_CATALYST_HISTORY_ITEM_LIMIT)
}

function unavailable(
  reason: StockCatalystHistoryUnavailableReason,
): StockCatalystHistoryResult {
  return { status: 'unavailable', reason, items: [] }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError')
}

function awaitWithSignal<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

function createStockCatalystHistoryClient(url: string, key: string) {
  try {
    return createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  } catch {
    return null
  }
}

export async function getStockCatalystHistory(
  symbolInput: string,
  options: LoadStockCatalystHistoryOptions = {},
): Promise<StockCatalystHistoryResult> {
  const symbol = normalizeMarketSymbol(symbolInput)
  if (!isValidStockPageSymbol(symbol)) return unavailable('invalid_data')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return unavailable('configuration')

  options.signal?.throwIfAborted()
  const deadlineSignal = AbortSignal.timeout(STOCK_CATALYST_HISTORY_TIMEOUT_MS)
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadlineSignal])
    : deadlineSignal
  const supabase = createStockCatalystHistoryClient(url, key)
  if (!supabase) return unavailable('configuration')

  try {
    const query = supabase
      .from('stock_summaries')
      .select(
        'symbol,summary_date,summary_text,generated_at,no_summary_reason,config_version,winning_event,metadata',
      )
      .eq('symbol', symbol)
      .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
      .not('summary_text', 'is', null)
      .or('no_summary_reason.is.null,no_summary_reason.neq.validation_rejected')
      .order('summary_date', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(STOCK_CATALYST_HISTORY_QUERY_LIMIT)
      .abortSignal(signal)
    const { data, error } = await awaitWithSignal(query, signal)

    if (options.signal?.aborted) throw abortReason(options.signal)
    if (deadlineSignal.aborted) return unavailable('timeout')
    if (error) return unavailable('query')
    if (!Array.isArray(data)) return unavailable('invalid_data')
    if (data.length === 0) return { status: 'empty', items: [] }

    const items = mapStockCatalystHistoryRows(data, symbol)
    if (!items || items.length === 0) return unavailable('invalid_data')
    return { status: 'ready', items }
  } catch {
    if (options.signal?.aborted) throw abortReason(options.signal)
    if (deadlineSignal.aborted) return unavailable('timeout')
    return unavailable('query')
  }
}
