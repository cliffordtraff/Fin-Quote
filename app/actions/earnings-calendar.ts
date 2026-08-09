'use server'

import {
  CATALYST_CALENDAR_EARNINGS_LIMIT,
  getCatalystWeek,
  getCurrentCatalystWeek,
  isDateKey,
  type EarningsSession,
} from '@/lib/catalyst-calendar'
import { readBoundedProviderJson } from '@/lib/catalyst-provider-response'
import { safeErrorMessage } from '@/lib/safe-logging'
import {
  getSP500Constituent,
  isSP500,
  normalizeSP500Symbol,
} from '@/lib/sp500'

export interface EarningsData {
  symbol: string
  name: string
  date: string
  time: EarningsSession
  fiscalDateEnding: string
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
}

export interface EarningsCalendarResult {
  earnings: EarningsData[]
  totalCount: number
}

export type EarningsCalendarLoadResult =
  | EarningsCalendarResult
  | { error: string }

export interface CatalystEarningsCalendarResult extends EarningsCalendarResult {
  truncated: boolean
}

export type CatalystEarningsCalendarLoadResult =
  | CatalystEarningsCalendarResult
  | { error: string }

const DASHBOARD_EARNINGS_LIMIT = 10
const MAX_PROVIDER_ROWS = 10_000
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 6_000
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/
const MAX_DATE_LENGTH = 32

const MEGA_CAP_SYMBOLS = new Set([
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'BRK.B', 'LLY', 'AVGO',
  'TSLA', 'WMT', 'JPM', 'V', 'UNH', 'XOM', 'MA', 'ORCL', 'COST', 'HD',
])

type LoadMode = 'dashboard' | 'calendar'
type ProviderRow = Record<string, unknown>

function isRecord(value: unknown): value is ProviderRow {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizedDate(value: unknown, allowEmpty = false): string | null {
  if ((value === null || value === undefined || value === '') && allowEmpty) return ''
  if (typeof value !== 'string' || value.length > MAX_DATE_LENGTH) return null
  const date = value.trim()
  return isDateKey(date) ? date : null
}

function normalizedSession(value: unknown): EarningsSession | undefined {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return normalized === 'bmo' || normalized === 'amc' || normalized === 'dmh'
    ? normalized
    : undefined
}

function parseEligibleRow(row: ProviderRow): EarningsData | null {
  if (typeof row.symbol !== 'string') return null
  const rawSymbol = row.symbol.trim().toUpperCase()
  if (!SYMBOL_PATTERN.test(rawSymbol)) return null

  const canonicalSymbol = normalizeSP500Symbol(rawSymbol)
  if (!canonicalSymbol || !isSP500(canonicalSymbol)) return null

  const date = normalizedDate(row.date)
  const fiscalDateEnding = normalizedDate(row.fiscalDateEnding, true)
  const time = normalizedSession(row.time)
  const eps = nullableFiniteNumber(row.eps)
  const epsEstimated = nullableFiniteNumber(row.epsEstimated)
  const revenue = nullableFiniteNumber(row.revenue)
  const revenueEstimated = nullableFiniteNumber(row.revenueEstimated)

  if (
    date === null ||
    fiscalDateEnding === null ||
    time === undefined ||
    eps === undefined ||
    epsEstimated === undefined ||
    revenue === undefined ||
    revenueEstimated === undefined
  ) {
    return null
  }

  return {
    symbol: canonicalSymbol,
    name: getSP500Constituent(canonicalSymbol)?.name ?? canonicalSymbol,
    date,
    time,
    fiscalDateEnding,
    eps,
    epsEstimated,
    revenue,
    revenueEstimated,
  }
}

function sessionRank(session: EarningsSession): number {
  if (session === 'bmo') return 0
  if (session === 'dmh') return 1
  if (session === 'amc') return 2
  return 3
}

function chronologicalSort(left: EarningsData, right: EarningsData): number {
  const dateOrder = left.date.localeCompare(right.date, 'en-US')
  if (dateOrder !== 0) return dateOrder
  const sessionOrder = sessionRank(left.time) - sessionRank(right.time)
  if (sessionOrder !== 0) return sessionOrder
  return left.symbol.localeCompare(right.symbol, 'en-US')
}

function parseProviderRows(value: unknown): EarningsData[] | null {
  if (!Array.isArray(value) || value.length > MAX_PROVIDER_ROWS) return null

  const parsed: EarningsData[] = []
  const byCatalyst = new Map<string, EarningsData>()
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.symbol !== 'string') return null

    const normalized = candidate.symbol.trim().toUpperCase()
    if (!SYMBOL_PATTERN.test(normalized)) return null
    if (!isSP500(normalized)) continue

    const earning = parseEligibleRow(candidate)
    if (!earning) return null
    const key = `${earning.date}|${earning.symbol}`
    const previous = byCatalyst.get(key)
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(earning)) return null
      continue
    }
    byCatalyst.set(key, earning)
    parsed.push(earning)
  }

  return parsed
}

function selectDashboardEarnings(earnings: EarningsData[]): EarningsData[] {
  const megaCaps: EarningsData[] = []
  const others: EarningsData[] = []

  for (const earning of earnings) {
    if (MEGA_CAP_SYMBOLS.has(earning.symbol)) megaCaps.push(earning)
    else others.push(earning)
  }

  megaCaps.sort(chronologicalSort)
  others.sort(chronologicalSort)

  return [
    ...megaCaps.slice(0, DASHBOARD_EARNINGS_LIMIT),
    ...others.slice(0, Math.max(0, DASHBOARD_EARNINGS_LIMIT - megaCaps.length)),
  ].slice(0, DASHBOARD_EARNINGS_LIMIT).sort(chronologicalSort)
}

async function loadEarningsCalendar(
  mode: LoadMode,
  referenceTime?: string,
): Promise<EarningsCalendarLoadResult> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.error('FMP_API_KEY not set')
    return { error: 'FMP_API_KEY not set' }
  }

  try {
    const week = mode === 'calendar'
      ? getCurrentCatalystWeek(referenceTime ?? '')
      : getCatalystWeek()
    if (!week) return { error: 'Failed to fetch earnings calendar' }
    const toDate = mode === 'calendar' ? week.toDate : week.businessToDate
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${week.fromDate}&to=${toDate}&apikey=${apiKey}`,
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    )

    if (!response.ok) {
      console.error('Failed to fetch earnings calendar:', response.status)
      return { error: 'Failed to fetch earnings calendar' }
    }

    const providerEarnings = parseProviderRows(
      await readBoundedProviderJson(response, MAX_PROVIDER_RESPONSE_BYTES),
    )
    if (!providerEarnings) {
      console.error('Invalid earnings calendar response')
      return { error: 'Failed to fetch earnings calendar' }
    }

    const earnings = providerEarnings.filter(
      (earning) => earning.date >= week.fromDate && earning.date <= toDate,
    )
    const totalCount = earnings.length
    const selected = mode === 'calendar'
      ? earnings.sort(chronologicalSort).slice(0, CATALYST_CALENDAR_EARNINGS_LIMIT)
      : selectDashboardEarnings(earnings)

    return { earnings: selected, totalCount }
  } catch (error) {
    console.error('Error fetching earnings calendar:', safeErrorMessage(error))
    return { error: 'Failed to fetch earnings calendar' }
  }
}

/** Compact, priority-weighted feed used by the dashboard and briefs. */
export async function fetchEarningsCalendarWithStatus(): Promise<EarningsCalendarLoadResult> {
  return loadEarningsCalendar('dashboard')
}

/** Chronological, bounded week feed used only by the full Catalyst Calendar. */
export async function fetchEarningsCalendarForCatalystCalendar(
  referenceTime: string,
): Promise<CatalystEarningsCalendarLoadResult> {
  const result = await loadEarningsCalendar('calendar', referenceTime)
  if ('error' in result) return result
  return {
    ...result,
    truncated: result.totalCount > CATALYST_CALENDAR_EARNINGS_LIMIT,
  }
}

export async function fetchEarningsCalendar(): Promise<EarningsCalendarResult> {
  const result = await fetchEarningsCalendarWithStatus()
  return 'error' in result ? { earnings: [], totalCount: 0 } : result
}
