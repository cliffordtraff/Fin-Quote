import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import type { Database, Json } from '@/lib/database.types'

type CacheRow = Database['public']['Tables']['stock_why_moving_cache']['Row']
type CacheInsert = Database['public']['Tables']['stock_why_moving_cache']['Insert']

export type StockWhyMovingStatus = 'found' | 'not_found' | 'error'

export interface StockWhyMovingResult {
  symbol: string
  status: StockWhyMovingStatus
  displayText: string | null
  headline: string | null
  summary: string | null
  bulletPoints: string[]
  sentiment: string | null
  source: string | null
  sourceTimestamp: string | null
  isCatalyst: boolean | null
  sourceUrl: string
  fetchedAt: string
  errorMessage: string | null
}

export type StockWhyMovingLoadDisposition =
  | 'fresh_cache'
  | 'live'
  | 'stale_fallback'
  | 'live_error'

export interface StockWhyMovingLoadOutcome {
  result: StockWhyMovingResult
  disposition: StockWhyMovingLoadDisposition
  liveErrorMessage?: string | null
}

interface FinvizWhyMovingPayload {
  id?: number
  ticker?: string
  dateTime?: string | null
  headline?: string | null
  summary?: string | null
  source?: string | null
  sentiment?: string | null
  catalyst?: boolean | null
  instrument?: number | null
  bulletPointsList?: unknown
}

interface StockWhyMovingRecord extends StockWhyMovingResult {
  rawPayload: Json | null
}

const FOUND_TTL_MS = 30 * 60 * 1000
const NOT_FOUND_TTL_MS = 10 * 60 * 1000
const ERROR_TTL_MS = 5 * 60 * 1000

export const WHY_MOVING_CACHE_TTL = {
  foundMs: FOUND_TTL_MS,
  notFoundMs: NOT_FOUND_TTL_MS,
  errorMs: ERROR_TTL_MS,
} as const
const WHY_MOVING_SCRIPT_RE =
  /<script id="why-stock-moving-init-data-\d+" type="application\/json">([\s\S]*?)<\/script>/i
const memoryCache = new Map<string, StockWhyMovingRecord>()

function createSupabaseClient(key?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !key) {
    return null
  }

  return createClient<Database>(url, key)
}

function getSupabasePublic() {
  // Server-side refreshes need to read the cache after its Data API access was
  // locked down. Prefer the service role when it is available; browser-facing
  // callers still fall back to the public key and remain subject to RLS.
  return createSupabaseClient(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

function getSupabaseAdmin() {
  return createSupabaseClient(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

export function buildFinvizQuoteUrl(symbol: string): string {
  const finvizSymbol = normalizeSymbol(symbol).replace(/\./g, '-')
  return `https://finviz.com/quote.ashx?t=${encodeURIComponent(finvizSymbol)}&p=d`
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeBulletPoints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
}

function isLikelyFinvizQuotePage(html: string): boolean {
  const hasQuoteTitle = html.includes('Stock Price and Quote')
  const hasFinvizBranding = html.includes('Stock screener for investors and traders') || html.includes('finviz.com')
  const hasWhyMovingFeature = html.includes('"stockswhymoving":true') || html.includes('stockswhymoving":true')
  const hasFeatureFlags = html.includes('featureFlags')

  return hasQuoteTitle && (hasFinvizBranding || hasWhyMovingFeature || hasFeatureFlags)
}

function isLikelyFinvizAccessChallenge(html: string): boolean {
  const normalized = html.toLowerCase()
  return normalized.includes('just a moment') ||
    normalized.includes('access denied') ||
    normalized.includes('cf-chl-') ||
    normalized.includes('captcha')
}

function sleep(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('Finviz refresh was cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function htmlFingerprint(html: string): string {
  return createHash('sha1').update(html).digest('hex').slice(0, 12)
}

async function writeDebugParseFailure(input: {
  symbol: string
  html: string
  attempt: number
  sourceUrl: string
  reason: string
}) {
  const debugDir = process.env.FINVIZ_DEBUG_DIR
  if (!debugDir) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fingerprint = htmlFingerprint(input.html)
  const base = `${timestamp}_${input.symbol}_a${input.attempt + 1}_${fingerprint}`

  await mkdir(debugDir, { recursive: true })

  const meta = {
    symbol: input.symbol,
    reason: input.reason,
    attempt: input.attempt + 1,
    sourceUrl: input.sourceUrl,
    htmlLength: input.html.length,
    fingerprint,
    createdAt: new Date().toISOString(),
    markers: {
      hasWhyMovingScript: WHY_MOVING_SCRIPT_RE.test(input.html),
      hasQuoteTitle: input.html.includes('Stock Price and Quote'),
      hasFeatureFlags: input.html.includes('featureFlags'),
      hasWhyMovingFeature: input.html.includes('stockswhymoving'),
      hasCloudflare: input.html.includes('Cloudflare'),
      hasJustAMoment: input.html.includes('Just a moment'),
      hasAccessDenied: input.html.includes('Access denied'),
      hasEnableJavaScript: input.html.includes('enable JavaScript'),
    },
  }

  await Promise.all([
    writeFile(`${debugDir}/${base}.json`, JSON.stringify(meta, null, 2)),
    writeFile(`${debugDir}/${base}.html`, input.html),
  ])
}

function isMissingCacheTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message ?? ''
  const code = error?.code ?? ''

  return (
    code === 'PGRST205' ||
    (message.includes('stock_why_moving_cache') && message.includes('schema cache'))
  )
}

export function parseFinvizWhyMovingHtml(html: string): FinvizWhyMovingPayload | null {
  const match = html.match(WHY_MOVING_SCRIPT_RE)
  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(match[1]) as { whyMoving?: FinvizWhyMovingPayload | null }
    return parsed?.whyMoving ?? null
  } catch {
    return null
  }
}

export function buildWhyMovingDisplayText(input: {
  headline?: string | null
  summary?: string | null
  bulletPoints?: string[] | null
}): string | null {
  const headline = normalizeText(input.headline)
  if (headline) {
    return headline
  }

  const summary = normalizeText(input.summary)
  if (summary) {
    return summary
  }

  const firstBullet = input.bulletPoints?.[0]
  return normalizeText(firstBullet)
}

function cacheTtlMs(status: StockWhyMovingStatus): number {
  switch (status) {
    case 'found':
      return FOUND_TTL_MS
    case 'not_found':
      return NOT_FOUND_TTL_MS
    case 'error':
      return ERROR_TTL_MS
  }
}

function mapCacheRow(row: CacheRow): StockWhyMovingRecord {
  return {
    symbol: row.symbol,
    status: (row.status as StockWhyMovingStatus) ?? 'not_found',
    displayText: row.display_text,
    headline: row.headline,
    summary: row.summary,
    bulletPoints: normalizeBulletPoints(row.bullet_points),
    sentiment: row.sentiment,
    source: row.source,
    sourceTimestamp: row.source_timestamp,
    isCatalyst: row.is_catalyst,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    errorMessage: row.error_message,
    rawPayload: row.raw_payload,
  }
}

function toCacheInsert(record: StockWhyMovingRecord): CacheInsert {
  return {
    symbol: record.symbol,
    status: record.status,
    display_text: record.displayText,
    headline: record.headline,
    summary: record.summary,
    bullet_points: record.bulletPoints,
    sentiment: record.sentiment,
    source: record.source,
    source_timestamp: record.sourceTimestamp,
    is_catalyst: record.isCatalyst,
    // Production intentionally rejects stored provider documents. Retain only
    // the bounded display projection used by downstream WIIM consumers.
    raw_payload: null,
    source_url: record.sourceUrl,
    error_message: record.errorMessage,
    fetched_at: record.fetchedAt,
  }
}

function stripRawPayload(record: StockWhyMovingRecord): StockWhyMovingResult {
  return {
    symbol: record.symbol,
    status: record.status,
    displayText: record.displayText,
    headline: record.headline,
    summary: record.summary,
    bulletPoints: [...record.bulletPoints],
    sentiment: record.sentiment,
    source: record.source,
    sourceTimestamp: record.sourceTimestamp,
    isCatalyst: record.isCatalyst,
    sourceUrl: record.sourceUrl,
    fetchedAt: record.fetchedAt,
    errorMessage: record.errorMessage,
  }
}

function isFreshRecord(record: StockWhyMovingRecord): boolean {
  const fetchedAtMs = new Date(record.fetchedAt).getTime()
  if (!Number.isFinite(fetchedAtMs)) {
    return false
  }
  return Date.now() - fetchedAtMs < cacheTtlMs(record.status)
}

export function isFreshWhyMovingResult(
  result: Pick<StockWhyMovingResult, 'status' | 'fetchedAt'>,
  now = Date.now(),
): boolean {
  const fetchedAtMs = new Date(result.fetchedAt).getTime()
  if (!Number.isFinite(fetchedAtMs)) {
    return false
  }
  return now - fetchedAtMs < cacheTtlMs(result.status)
}

export async function peekStockWhyMovingCache(symbol: string): Promise<{
  freshness: 'fresh' | 'stale' | 'missing'
  result: StockWhyMovingResult | null
}> {
  const normalized = normalizeSymbol(symbol)
  const inMemoryCached = readInMemoryWhyMoving(normalized)
  if (inMemoryCached) {
    const result = stripRawPayload(inMemoryCached)
    return {
      freshness: isFreshRecord(inMemoryCached) ? 'fresh' : 'stale',
      result,
    }
  }

  const cached = await readCachedWhyMoving(normalized)
  if (!cached) {
    return { freshness: 'missing', result: null }
  }

  return {
    freshness: isFreshRecord(cached) ? 'fresh' : 'stale',
    result: stripRawPayload(cached),
  }
}

function readInMemoryWhyMoving(symbol: string): StockWhyMovingRecord | null {
  return memoryCache.get(symbol) ?? null
}

function writeInMemoryWhyMoving(record: StockWhyMovingRecord): void {
  memoryCache.set(record.symbol, record)

  if (memoryCache.size <= 256) {
    return
  }

  for (const [symbol, cached] of memoryCache) {
    if (!isFreshRecord(cached)) {
      memoryCache.delete(symbol)
    }

    if (memoryCache.size <= 192) {
      return
    }
  }

  const oldestKey = memoryCache.keys().next().value
  if (oldestKey) {
    memoryCache.delete(oldestKey)
  }
}

async function readCachedWhyMoving(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockWhyMovingRecord | null> {
  signal?.throwIfAborted()
  const supabasePublic = getSupabasePublic()
  if (!supabasePublic) {
    return null
  }

  try {
    let query = supabasePublic
      .from('stock_why_moving_cache')
      .select('*')
      .eq('symbol', symbol)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query.maybeSingle()
    signal?.throwIfAborted()

    if (error || !data) {
      if (error) {
        if (isMissingCacheTableError(error)) {
          return null
        }
        console.error('[stock-why-moving] Failed to read cache:', error.message)
      }
      return null
    }

    return mapCacheRow(data)
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    console.error('[stock-why-moving] Unexpected cache read error:', error)
    return null
  }
}

async function writeCachedWhyMoving(
  record: StockWhyMovingRecord,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    console.log('[stock-why-moving] Skipping cache write: SUPABASE_SERVICE_ROLE_KEY is missing')
    return
  }

  try {
    let query = supabaseAdmin
      .from('stock_why_moving_cache')
      .upsert(toCacheInsert(record), { onConflict: 'symbol' })
    if (signal) query = query.abortSignal(signal)
    const { error } = await query
    signal?.throwIfAborted()

    if (error) {
      if (isMissingCacheTableError(error)) {
        return
      }
      console.error('[stock-why-moving] Failed to write cache:', error.message)
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    console.error('[stock-why-moving] Unexpected cache write error:', error)
  }
}

async function fetchFinvizWhyMoving(
  symbol: string,
  signal?: AbortSignal,
  maxAttempts = 3,
): Promise<StockWhyMovingRecord> {
  const normalized = normalizeSymbol(symbol)
  const sourceUrl = buildFinvizQuoteUrl(normalized)
  const attemptLimit = Math.max(1, Math.min(3, Math.floor(maxAttempts)))

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    signal?.throwIfAborted()
    const fetchedAt = new Date().toISOString()

    try {
      const response = await fetch(sourceUrl, {
        cache: 'no-store',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        if (response.body) {
          try {
            await response.body.cancel(
              new Error(`Finviz returned HTTP ${response.status}.`),
            )
          } catch {
            // The response has already settled; preserve the original status.
          }
        }
        signal?.throwIfAborted()
        if (response.status === 403 || response.status === 429) {
          return {
            symbol: normalized,
            status: 'error',
            displayText: null,
            headline: null,
            summary: null,
            bulletPoints: [],
            sentiment: null,
            source: null,
            sourceTimestamp: null,
            isCatalyst: null,
            sourceUrl,
            fetchedAt,
            errorMessage: `Finviz blocking response ${response.status}`,
            rawPayload: null,
          }
        }
        if (attempt < attemptLimit - 1) {
          await sleep(250 * (attempt + 1), signal)
          continue
        }

        return {
          symbol: normalized,
          status: 'error',
          displayText: null,
          headline: null,
          summary: null,
          bulletPoints: [],
          sentiment: null,
          source: null,
          sourceTimestamp: null,
          isCatalyst: null,
          sourceUrl,
          fetchedAt,
          errorMessage: `Finviz returned ${response.status}`,
          rawPayload: null,
        }
      }

      const html = await response.text()
      signal?.throwIfAborted()
      if (isLikelyFinvizAccessChallenge(html)) {
        return {
          symbol: normalized,
          status: 'error',
          displayText: null,
          headline: null,
          summary: null,
          bulletPoints: [],
          sentiment: null,
          source: null,
          sourceTimestamp: null,
          isCatalyst: null,
          sourceUrl,
          fetchedAt,
          errorMessage: 'Finviz access challenge detected',
          rawPayload: null,
        }
      }
      const parsed = parseFinvizWhyMovingHtml(html)

      if (!parsed) {
        if (isLikelyFinvizQuotePage(html)) {
          return {
            symbol: normalized,
            status: 'not_found',
            displayText: null,
            headline: null,
            summary: null,
            bulletPoints: [],
            sentiment: null,
            source: null,
            sourceTimestamp: null,
            isCatalyst: null,
            sourceUrl,
            fetchedAt,
            errorMessage: null,
            rawPayload: null,
          }
        }

        if (attempt < attemptLimit - 1) {
          await sleep(250 * (attempt + 1), signal)
          continue
        }

        await writeDebugParseFailure({
          symbol: normalized,
          html,
          attempt,
          sourceUrl,
          reason: 'parse_failure_after_retries',
        })

        return {
          symbol: normalized,
          status: 'error',
          displayText: null,
          headline: null,
          summary: null,
          bulletPoints: [],
          sentiment: null,
          source: null,
          sourceTimestamp: null,
          isCatalyst: null,
          sourceUrl,
          fetchedAt,
          errorMessage: 'Could not parse Finviz quote page',
          rawPayload: null,
        }
      }

      const bulletPoints = normalizeBulletPoints(parsed.bulletPointsList)
      const headline = normalizeText(parsed.headline)
      const summary = normalizeText(parsed.summary)

      return {
        symbol: normalized,
        status: 'found',
        displayText: buildWhyMovingDisplayText({ headline, summary, bulletPoints }),
        headline,
        summary,
        bulletPoints,
        sentiment: normalizeText(parsed.sentiment),
        source: normalizeText(parsed.source),
        sourceTimestamp: normalizeText(parsed.dateTime),
        isCatalyst: typeof parsed.catalyst === 'boolean' ? parsed.catalyst : null,
        sourceUrl,
        fetchedAt,
        errorMessage: null,
        rawPayload: parsed as Json,
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (attempt < attemptLimit - 1) {
        await sleep(250 * (attempt + 1), signal)
        continue
      }

      return {
        symbol: normalized,
        status: 'error',
        displayText: null,
        headline: null,
        summary: null,
        bulletPoints: [],
        sentiment: null,
        source: null,
        sourceTimestamp: null,
        isCatalyst: null,
        sourceUrl,
        fetchedAt,
        errorMessage: error instanceof Error ? error.message : 'Unknown fetch error',
        rawPayload: null,
      }
    }
  }

  return {
    symbol: normalized,
    status: 'error',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    errorMessage: 'Unexpected retry exhaustion',
    rawPayload: null,
  }
}

function selectNewestUsableCachedRecord(
  records: Array<StockWhyMovingRecord | null>,
): StockWhyMovingRecord | null {
  return records.reduce<StockWhyMovingRecord | null>((selected, record) => {
    if (!record || record.status === 'error') return selected
    if (!selected) return record
    const selectedAt = Date.parse(selected.fetchedAt)
    const recordAt = Date.parse(record.fetchedAt)
    if (!Number.isFinite(recordAt)) return selected
    if (!Number.isFinite(selectedAt) || recordAt > selectedAt) return record
    if (
      recordAt === selectedAt &&
      record.status === 'found' &&
      selected.status !== 'found'
    ) {
      return record
    }
    return selected
  }, null)
}

export async function getStockWhyMovingDataOutcome(
  symbol: string,
  options?: {
    forceRefresh?: boolean
    maxLiveAttempts?: number
    signal?: AbortSignal
  }
): Promise<StockWhyMovingLoadOutcome> {
  options?.signal?.throwIfAborted()
  const normalized = normalizeSymbol(symbol)
  const cached = await readCachedWhyMoving(normalized, options?.signal)
  options?.signal?.throwIfAborted()
  const inMemoryCached = readInMemoryWhyMoving(normalized)
  const fallbackCached = selectNewestUsableCachedRecord([inMemoryCached, cached])

  if (!options?.forceRefresh && fallbackCached && isFreshRecord(fallbackCached)) {
    writeInMemoryWhyMoving(fallbackCached)
    return {
      result: stripRawPayload(fallbackCached),
      disposition: 'fresh_cache',
      liveErrorMessage: null,
    }
  }

  const live = await fetchFinvizWhyMoving(
    normalized,
    options?.signal,
    options?.maxLiveAttempts,
  )
  options?.signal?.throwIfAborted()

  if (live.status === 'error') {
    if (fallbackCached) {
      return {
        result: stripRawPayload(fallbackCached),
        disposition: 'stale_fallback',
        liveErrorMessage: live.errorMessage,
      }
    }

    // Transport, cancellation, and parse failures are not authoritative
    // market facts. Return the typed error to the caller, but never harden it
    // into either the process cache or the service-role-backed table.
    return {
      result: stripRawPayload(live),
      disposition: 'live_error',
      liveErrorMessage: live.errorMessage,
    }
  }

  writeInMemoryWhyMoving(live)
  await writeCachedWhyMoving(live, options?.signal)
  options?.signal?.throwIfAborted()
  return {
    result: stripRawPayload(live),
    disposition: 'live',
    liveErrorMessage: null,
  }
}

export async function getStockWhyMovingData(
  symbol: string,
  options?: {
    forceRefresh?: boolean
    maxLiveAttempts?: number
    signal?: AbortSignal
  }
): Promise<StockWhyMovingResult> {
  return (await getStockWhyMovingDataOutcome(symbol, options)).result
}

export const __testOnly = {
  toCacheInsert,
}
