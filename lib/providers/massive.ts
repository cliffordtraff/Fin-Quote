/**
 * Massive (Polygon.io) implementation of MarketDataProvider.
 *
 * Handles the symbol routing (stocks vs indices vs futures),
 * timestamp conversion (epoch ms → ET date strings), and
 * response normalization to match the ProviderQuote / ProviderCandle shapes.
 */

import type {
  MarketDataProvider,
  ProviderQuote,
  ProviderCandle,
  ProviderNews,
  CandleTimespan,
  CandleRequestOptions,
  ProviderRequestOptions,
  QuoteRequestOptions,
} from './types'
import { FMPProvider } from './fmp'
import {
  formatMarketTimestamp,
  resolveSymbol,
  MASSIVE_TO_FMP_SYMBOLS,
} from './utils'
import { resolveFrontMonth, getFuturesSnapshot } from './futures-resolver'
import { safeErrorMessage } from '@/lib/safe-logging'
import {
  ProviderQuoteSymbolMismatchError,
  providerQuoteSymbolsMatch,
} from './quote-errors'

const MASSIVE_BASE = 'https://api.massive.com'
const TOP_MOVER_CANDIDATE_LIMIT = 60
const AGGREGATE_PAGE_LIMIT = 8
const AGGREGATE_ROW_LIMIT = 250_000
const AGGREGATE_DEADLINE_MS = 12_000

export type MassiveAggregateIncompleteReason =
  | 'deadline'
  | 'page_limit'
  | 'row_limit'
  | 'pagination_loop'
  | 'invalid_next_url'
  | 'invalid_response'
  | 'page_fetch_failed'

/**
 * Signals that an aggregate request did not reach the end of Massive's
 * `next_url` chain. Consumers must not display or cache the partial rows as if
 * they were a complete time window.
 */
export class MassiveAggregateIncompleteError extends Error {
  readonly code = 'MASSIVE_AGGREGATE_INCOMPLETE'

  constructor(
    readonly reason: MassiveAggregateIncompleteReason,
    readonly symbol: string,
    readonly pagesFetched: number,
    readonly rowsFetched: number,
  ) {
    super(
      `Massive aggregate data is incomplete for ${symbol} `
      + `(${reason}; ${pagesFetched} pages, ${rowsFetched} rows)`,
    )
    this.name = 'MassiveAggregateIncompleteError'
  }
}

function getApiKey(): string {
  const key = process.env.MASSIVE_API_KEY
  if (!key) throw new Error('MASSIVE_API_KEY not set')
  return key
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}` }
}

// ---------------------------------------------------------------------------
// Internal: detect symbol type after resolveSymbol
// ---------------------------------------------------------------------------

function isIndex(massiveSymbol: string): boolean {
  return massiveSymbol.startsWith('I:')
}

function isFutures(fmpSymbol: string): boolean {
  return fmpSymbol.endsWith('=F')
}

function rethrowAbort(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted()
  if (error instanceof Error && error.name === 'AbortError') throw error
}

function boundedNewsLimit(limit: number): number {
  return Number.isFinite(limit)
    ? Math.min(25, Math.max(1, Math.trunc(limit)))
    : 5
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStrictMassiveNewsItem(value: unknown, symbol: string): boolean {
  if (!isRecord(value)) return false
  const publisher = value.publisher
  return (
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.article_url === 'string' &&
    value.article_url.trim().length > 0 &&
    typeof value.published_utc === 'string' &&
    Array.isArray(value.tickers) &&
    value.tickers.every((ticker) => typeof ticker === 'string') &&
    value.tickers.includes(symbol) &&
    isRecord(publisher) &&
    typeof publisher.name === 'string' &&
    (value.description === undefined || value.description === null || typeof value.description === 'string') &&
    (value.image_url === undefined || value.image_url === null || typeof value.image_url === 'string')
  )
}

function assertLiveQuote(
  quote: ProviderQuote,
  options: QuoteRequestOptions,
  providerName: string,
): void {
  if (options.freshness !== 'live') return
  if (
    !quote.symbol ||
    !Number.isFinite(quote.price) ||
    quote.price === 0 ||
    !Number.isFinite(quote.change) ||
    !Number.isFinite(quote.changesPercentage)
  ) {
    throw new Error(`${providerName} returned an invalid quote payload`)
  }
}

// ---------------------------------------------------------------------------
// Internal: quote mapping helpers
// ---------------------------------------------------------------------------

/** Map a Massive stock snapshot ticker object → ProviderQuote. */
function mapStockSnapshot(t: any, originalSymbol?: string): ProviderQuote {
  const day = t.day ?? {}
  const prevDay = t.prevDay ?? {}
  return {
    symbol: originalSymbol ?? t.ticker ?? '',
    name: t.name ?? t.ticker ?? '',
    price: (day.c && day.c > 0 ? day.c : null) ?? t.lastTrade?.p ?? t.min?.c ?? 0,
    change: t.todaysChange ?? 0,
    changesPercentage: t.todaysChangePerc ?? 0,
    previousClose: prevDay.c ?? undefined,
    volume: day.v ?? undefined,
    dayHigh: day.h ?? undefined,
    dayLow: day.l ?? undefined,
    timestamp: t.updated ? t.updated : undefined,
  }
}

/** Map a Massive index snapshot result → ProviderQuote. */
function mapIndexSnapshot(r: any, originalSymbol?: string): ProviderQuote {
  const session = r.session ?? {}
  return {
    symbol: originalSymbol ?? MASSIVE_TO_FMP_SYMBOLS[r.ticker] ?? r.ticker ?? '',
    name: r.name ?? r.ticker ?? '',
    price: r.value ?? session.close ?? 0,
    change: session.change ?? 0,
    changesPercentage: session.change_percent ?? 0,
    previousClose: session.previous_close ?? undefined,
    dayHigh: session.high ?? undefined,
    dayLow: session.low ?? undefined,
  }
}

/** Map a Massive agg bar → ProviderCandle. */
function mapAggCandle(bar: any): ProviderCandle {
  const ms = bar.t ?? 0
  return {
    date: formatMarketTimestamp(ms),
    timestampMs: ms,
    open: bar.o ?? 0,
    high: bar.h ?? 0,
    low: bar.l ?? 0,
    close: bar.c ?? 0,
    volume: bar.v ?? 0,
  }
}

function isValidAggCandle(bar: unknown): boolean {
  if (!bar || typeof bar !== 'object' || Array.isArray(bar)) return false
  const raw = bar as Record<string, unknown>
  return typeof raw.t === 'number' && Number.isFinite(raw.t) && raw.t > 0 &&
    typeof raw.o === 'number' && Number.isFinite(raw.o) &&
    typeof raw.h === 'number' && Number.isFinite(raw.h) &&
    typeof raw.l === 'number' && Number.isFinite(raw.l) &&
    typeof raw.c === 'number' && Number.isFinite(raw.c)
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class MassiveProvider implements MarketDataProvider {
  private fmpFallbackProvider: FMPProvider | null = null

  // ---- Quotes ----

  async getQuote(
    symbol: string,
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote | null> {
    options.signal?.throwIfAborted()
    const massiveSymbol = resolveSymbol(symbol)

    // Futures — resolve front-month then snapshot
    if (isFutures(symbol)) {
      return this.getFuturesQuote(symbol, massiveSymbol, options)
    }

    // Index — use v3 snapshot
    if (isIndex(massiveSymbol)) {
      return this.getIndexQuote(symbol, massiveSymbol, options)
    }

    // Stock — use v2 snapshot single ticker
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${massiveSymbol}`,
        {
          headers: authHeaders(),
          cache: 'no-store',
          signal: options.signal,
        },
      )
      options.signal?.throwIfAborted()
      if (!res.ok) {
        if (res.status === 404) return null
        if (options.freshness === 'live') {
          throw new Error(`Massive stock quote request failed with status ${res.status}`)
        }
        return null
      }

      const json = await res.json()
      options.signal?.throwIfAborted()
      const ticker = json?.ticker
      if (!ticker) return null
      const rawSymbol = typeof ticker.ticker === 'string' ? ticker.ticker : ''
      if (!providerQuoteSymbolsMatch(rawSymbol, massiveSymbol)) {
        const mismatch = new ProviderQuoteSymbolMismatchError(
          'Massive',
          massiveSymbol,
          rawSymbol,
        )
        if (options.freshness === 'live') throw mismatch
        console.error(`[massive] ${mismatch.message}`)
        return null
      }

      const quote = mapStockSnapshot(ticker, symbol)
      assertLiveQuote(quote, options, 'Massive')
      return quote
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (options.freshness === 'live') throw err
      console.error(`[massive] getQuote error for ${symbol}:`, safeErrorMessage(err))
      return null
    }
  }

  async getQuotes(
    symbols: string[],
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote[]> {
    options.signal?.throwIfAborted()
    if (symbols.length === 0) return []
    const strict = options.freshness === 'live' || options.failureMode === 'throw'
    const strictSingleOptions: QuoteRequestOptions = strict
      ? { ...options, freshness: 'live' }
      : options

    // Split into stocks, indices, and futures
    const stocks: string[] = []
    const indices: string[] = []
    const futures: string[] = []

    for (const s of symbols) {
      if (isFutures(s)) {
        futures.push(s)
      } else {
        const ms = resolveSymbol(s)
        if (isIndex(ms)) {
          indices.push(s)
        } else {
          stocks.push(s)
        }
      }
    }

    const results: ProviderQuote[] = []

    // Fetch stocks in batch
    if (stocks.length > 0) {
      const massiveTickers = stocks.map(s => resolveSymbol(s))
      try {
        const res = await fetch(
          `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${massiveTickers.join(',')}`,
          { headers: authHeaders(), cache: 'no-store', signal: options.signal },
        )
        options.signal?.throwIfAborted()
        if (!res.ok) {
          if (strict) {
            throw new Error(`Massive stock batch quote request failed with status ${res.status}`)
          }
        } else {
          const json: unknown = await res.json()
          options.signal?.throwIfAborted()
          const tickers = json &&
            typeof json === 'object' &&
            !Array.isArray(json) &&
            Array.isArray((json as { tickers?: unknown }).tickers)
            ? (json as { tickers: unknown[] }).tickers
            : null
          if (!tickers) {
            if (strict) throw new Error('Massive returned an invalid stock batch quote payload')
          } else {
            // Build a map from Massive ticker → original FMP symbol.
            const tickerToOriginal = new Map<string, string>()
            for (let i = 0; i < stocks.length; i++) {
              tickerToOriginal.set(massiveTickers[i], stocks[i])
            }
            for (const rawTicker of tickers) {
              if (!rawTicker || typeof rawTicker !== 'object' || Array.isArray(rawTicker)) {
                if (strict) throw new Error('Massive returned an invalid stock batch quote payload')
                continue
              }
              const ticker = rawTicker as { ticker?: unknown }
              if (typeof ticker.ticker !== 'string') {
                if (strict) throw new Error('Massive returned an invalid stock batch quote payload')
                continue
              }
              const original = tickerToOriginal.get(ticker.ticker)
              if (!original) {
                if (strict) {
                  throw new ProviderQuoteSymbolMismatchError(
                    'Massive',
                    massiveTickers.join(','),
                    ticker.ticker,
                  )
                }
                continue
              }
              results.push(mapStockSnapshot(rawTicker, original))
            }
          }
        }
      } catch (err) {
        rethrowAbort(err, options.signal)
        if (strict) throw err
        console.error('[massive] getQuotes stock batch error:', safeErrorMessage(err))
      }
    }

    // Fetch indices in batch
    if (indices.length > 0) {
      const massiveTickers = indices.map(s => resolveSymbol(s))
      try {
        const res = await fetch(
          `${MASSIVE_BASE}/v3/snapshot/indices?ticker.any_of=${massiveTickers.join(',')}&limit=250`,
          { headers: authHeaders(), cache: 'no-store', signal: options.signal },
        )
        options.signal?.throwIfAborted()
        if (res.ok) {
          const json = await res.json()
          options.signal?.throwIfAborted()
          const items: any[] = json?.results ?? []
          const tickerToOriginal = new Map<string, string>()
          for (let i = 0; i < indices.length; i++) {
            tickerToOriginal.set(massiveTickers[i], indices[i])
          }
          for (const item of items) {
            const orig = tickerToOriginal.get(item.ticker) ?? MASSIVE_TO_FMP_SYMBOLS[item.ticker] ?? item.ticker
            results.push(mapIndexSnapshot(item, orig))
          }
        }
      } catch (err) {
        rethrowAbort(err, options.signal)
        console.error('[massive] getQuotes index batch error:', safeErrorMessage(err))
      }

      // Some Massive plans return partial or empty results from the batch
      // index endpoint while the single-index snapshot endpoint still works.
      const resolvedSymbols = new Set(results.map(result => result.symbol))
      const missingIndices = indices.filter(symbol => !resolvedSymbols.has(symbol))
      const fallbackQuotes = await Promise.all(
        missingIndices.map(symbol => this.getIndexQuote(
          symbol,
          resolveSymbol(symbol),
          strictSingleOptions,
        )),
      )
      for (const quote of fallbackQuotes) {
        if (quote) results.push(quote)
      }
    }

    // Fetch futures individually (each needs front-month resolution)
    if (futures.length > 0) {
      const futureResults = await Promise.all(
        futures.map(s => this.getFuturesQuote(s, resolveSymbol(s), strictSingleOptions)),
      )
      for (const q of futureResults) {
        if (q) results.push(q)
      }
    }

    options.signal?.throwIfAborted()
    const hasUsableQuote = results.some((quote) =>
      Boolean(quote.symbol) &&
      Number.isFinite(quote.price) &&
      quote.price !== 0 &&
      Number.isFinite(quote.change) &&
      Number.isFinite(quote.changesPercentage),
    )
    if (strict && !hasUsableQuote) {
      throw new Error('Massive returned no usable batch quotes')
    }

    return results
  }

  // ---- Candles ----

  async getIntraday(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    return this.fetchAggs(symbol, multiplier, timespan, from, to, options)
  }

  async getHistoricalDaily(
    symbol: string,
    from: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    return this.fetchAggs(symbol, 1, 'day', from, to, options)
  }

  // ---- Gainers / Losers ----

  async getGainers(): Promise<ProviderQuote[]> {
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/gainers`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return []

      const json = await res.json()
      const tickers: any[] = json?.tickers ?? []

      return tickers
        .map(t => mapStockSnapshot(t))
        .filter(q => q.price >= 0.10)
        .slice(0, TOP_MOVER_CANDIDATE_LIMIT)
    } catch (err) {
      console.error('[massive] getGainers error:', safeErrorMessage(err))
      return []
    }
  }

  async getLosers(): Promise<ProviderQuote[]> {
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/losers`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return []

      const json = await res.json()
      const tickers: any[] = json?.tickers ?? []

      return tickers
        .map(t => mapStockSnapshot(t))
        .filter(q => q.price >= 0.10)
        .slice(0, TOP_MOVER_CANDIDATE_LIMIT)
    } catch (err) {
      console.error('[massive] getLosers error:', safeErrorMessage(err))
      return []
    }
  }

  // ---- Snapshot ----

  async getSnapshot(tickers?: string[]): Promise<ProviderQuote[]> {
    if (tickers && tickers.length > 0) {
      return this.getQuotes(tickers)
    }

    // Full market snapshot (no filter)
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/tickers`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return []

      const json = await res.json()
      const tickerList: any[] = json?.tickers ?? []

      return tickerList.map(t => mapStockSnapshot(t))
    } catch (err) {
      console.error('[massive] getSnapshot error:', safeErrorMessage(err))
      return []
    }
  }

  // ---- News ----

  async getNews(
    symbol: string,
    limit = 5,
    options: ProviderRequestOptions = {},
  ): Promise<ProviderNews[]> {
    options.signal?.throwIfAborted()
    const strict = options.failureMode === 'throw'
    const massiveSymbol = resolveSymbol(symbol)
    const safeLimit = boundedNewsLimit(limit)
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/reference/news?ticker=${massiveSymbol}&limit=${safeLimit}`,
        {
          headers: authHeaders(),
          cache: 'no-store',
          signal: options.signal,
        },
      )
      options.signal?.throwIfAborted()
      if (!res.ok) {
        if (strict) {
          throw new Error(`Massive news request failed with status ${res.status}`)
        }
        return []
      }

      const json: unknown = await res.json()
      options.signal?.throwIfAborted()
      const articles = isRecord(json) && Array.isArray(json.results)
        ? json.results
        : null
      if (!articles) {
        if (strict) throw new Error('Massive returned an invalid news payload')
        return []
      }
      if (strict && articles.some((article) =>
        !isStrictMassiveNewsItem(article, massiveSymbol)
      )) {
        throw new Error('Massive returned an invalid news payload')
      }

      return articles.slice(0, safeLimit).map((a: any) => ({
        title: a.title ?? '',
        text: a.description ?? '',
        url: a.article_url ?? '',
        image: a.image_url ?? null,
        publishedDate: a.published_utc ?? '',
        site: a.publisher?.name ?? '',
        symbol,
      }))
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (strict) throw err
      console.error(`[massive] getNews error for ${symbol}:`, safeErrorMessage(err))
      return []
    }
  }

  // ---- Private helpers ----

  /**
   * Unified aggs fetcher that routes to the correct endpoint based on symbol type.
   * Stocks/indices use `/v2/aggs/ticker/...`, futures use the futures-resolver.
   */
  private async fetchAggs(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    options.signal?.throwIfAborted()
    const massiveSymbol = resolveSymbol(symbol)

    // Futures need front-month resolution + dedicated aggs endpoint
    if (isFutures(symbol)) {
      return this.fetchFuturesAggs(
        symbol,
        massiveSymbol,
        multiplier,
        timespan,
        from,
        to,
        options,
      )
    }

    // Stocks and indices use the same /v2/aggs endpoint
    const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toParam = to ?? new Date().toISOString().split('T')[0]

    try {
      const url = `${MASSIVE_BASE}/v2/aggs/ticker/${massiveSymbol}/range/${multiplier}/${timespan}/${fromParam}/${toParam}?adjusted=true&sort=asc&limit=50000`
      const results = await this.fetchAggregatePages(
        url,
        symbol,
        isIndex(massiveSymbol),
        options,
      )
      if (results === null) {
        return isIndex(massiveSymbol)
          ? this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to, options)
          : []
      }

      if (results.length === 0 && isIndex(massiveSymbol)) {
        return this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to, options)
      }

      if (
        options.failureMode === 'throw' &&
        results.some((result) => !isValidAggCandle(result))
      ) {
        throw new Error('Massive returned an invalid aggregate candle payload')
      }

      // Adjacent pages may repeat their boundary aggregate. Keep the freshest
      // copy for each timestamp, then restore deterministic ascending order.
      const candlesByTimestamp = new Map<number, ProviderCandle>()
      for (const result of results) {
        const candle = mapAggCandle(result)
        candlesByTimestamp.set(candle.timestampMs, candle)
      }

      return Array.from(candlesByTimestamp.values())
        .sort((left, right) => left.timestampMs - right.timestampMs)
    } catch (err) {
      options.signal?.throwIfAborted()
      if (err instanceof MassiveAggregateIncompleteError) {
        throw err
      }
      if (options.failureMode === 'throw') throw err
      console.error(`[massive] fetchAggs error for ${symbol}:`, safeErrorMessage(err))
      return isIndex(massiveSymbol)
        ? this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to, options)
        : []
    }
  }

  /**
   * Follow Massive's aggregate `next_url` contract without ever returning a
   * prefix that merely looks like a complete response. Every page keeps Bearer
   * auth because `next_url` intentionally does not carry our credential.
   */
  private async fetchAggregatePages(
    initialUrl: string,
    symbol: string,
    allowInitialFailureFallback: boolean,
    options: CandleRequestOptions = {},
  ): Promise<any[] | null> {
    const deadlineAt = Date.now() + AGGREGATE_DEADLINE_MS
    const visitedUrls = new Set<string>()
    const results: any[] = []
    let nextUrl: string | null = initialUrl
    let pagesFetched = 0
    let rowsFetched = 0

    const incomplete = (
      reason: MassiveAggregateIncompleteReason,
      reportedRows = rowsFetched,
    ) => new MassiveAggregateIncompleteError(
      reason,
      symbol,
      pagesFetched,
      reportedRows,
    )

    while (nextUrl) {
      if (pagesFetched >= AGGREGATE_PAGE_LIMIT) {
        throw incomplete('page_limit')
      }

      const remainingMs = deadlineAt - Date.now()
      if (remainingMs <= 0) {
        throw incomplete('deadline')
      }

      let requestUrl: URL
      try {
        requestUrl = new URL(nextUrl, MASSIVE_BASE)
      } catch {
        throw incomplete('invalid_next_url')
      }

      if (requestUrl.origin !== MASSIVE_BASE || visitedUrls.has(requestUrl.href)) {
        throw incomplete(
          requestUrl.origin !== MASSIVE_BASE
            ? 'invalid_next_url'
            : 'pagination_loop',
        )
      }
      visitedUrls.add(requestUrl.href)

      const controller = new AbortController()
      const abortFromCaller = () => controller.abort(options.signal?.reason)
      options.signal?.addEventListener('abort', abortFromCaller, { once: true })
      const deadlineTimer = setTimeout(() => controller.abort(), remainingMs)

      let json: any
      try {
        options.signal?.throwIfAborted()
        const response = await fetch(requestUrl.href, {
          headers: authHeaders(),
          cache: 'no-store',
          signal: controller.signal,
        })
        options.signal?.throwIfAborted()

        if (!response.ok) {
          if (
            pagesFetched === 0
            && allowInitialFailureFallback
          ) {
            return null
          }
          if (
            pagesFetched === 0
            && response.status === 404
            && options.failureMode !== 'throw'
          ) {
            return null
          }
          throw incomplete('page_fetch_failed')
        }

        json = await response.json()
        options.signal?.throwIfAborted()
      } catch (err) {
        options.signal?.throwIfAborted()
        if (err instanceof MassiveAggregateIncompleteError) throw err
        if (controller.signal.aborted || Date.now() >= deadlineAt) {
          throw incomplete('deadline')
        }
        if (pagesFetched === 0 && allowInitialFailureFallback) return null
        throw incomplete('page_fetch_failed')
      } finally {
        clearTimeout(deadlineTimer)
        options.signal?.removeEventListener('abort', abortFromCaller)
      }

      pagesFetched += 1
      if (!Array.isArray(json?.results)) {
        throw incomplete('invalid_response')
      }

      const pageResults: any[] = json.results
      const prospectiveRows = rowsFetched + pageResults.length
      if (prospectiveRows > AGGREGATE_ROW_LIMIT) {
        throw incomplete('row_limit', prospectiveRows)
      }

      for (const result of pageResults) {
        results.push(result)
      }
      rowsFetched = prospectiveRows

      const candidateNextUrl = json?.next_url
      if (candidateNextUrl == null || candidateNextUrl === '') {
        nextUrl = null
        continue
      }
      if (typeof candidateNextUrl !== 'string') {
        throw incomplete('invalid_next_url')
      }
      if (rowsFetched >= AGGREGATE_ROW_LIMIT) {
        throw incomplete('row_limit')
      }
      if (pagesFetched >= AGGREGATE_PAGE_LIMIT) {
        throw incomplete('page_limit')
      }

      nextUrl = candidateNextUrl
    }

    return results
  }

  private async fetchFuturesAggs(
    originalSymbol: string,
    productCode: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    options.signal?.throwIfAborted()
    const contractTicker = await resolveFrontMonth(productCode, options)
    if (!contractTicker) {
      return this.getFuturesFallbackCandles(
        originalSymbol,
        multiplier,
        timespan,
        from,
        to,
        options,
      )
    }

    // Map our CandleTimespan to Massive futures resolution format
    const resolutionMap: Record<CandleTimespan, string> = {
      second: `${multiplier}sec`,
      minute: `${multiplier}min`,
      hour: `${multiplier}hr`,
      day: '1day',
      week: '1week',
      month: '1month',
    }
    const resolution = resolutionMap[timespan] ?? '1day'

    // Import inline to avoid circular dependency
    const { getFuturesCandles } = await import('./futures-resolver')
    const candles = await getFuturesCandles(contractTicker, resolution, from, options)

    if (candles.length === 0) {
      return this.getFuturesFallbackCandles(
        originalSymbol,
        multiplier,
        timespan,
        from,
        to,
        options,
      )
    }

    return candles.map(c => ({
      date: formatMarketTimestamp(c.timestampMs),
      timestampMs: c.timestampMs,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  }

  private async getIndexQuote(
    originalSymbol: string,
    massiveSymbol: string,
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote | null> {
    options.signal?.throwIfAborted()
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v3/snapshot/indices?ticker.any_of=${massiveSymbol}&limit=1`,
        {
          headers: authHeaders(),
          cache: 'no-store',
          signal: options.signal,
        },
      )
      options.signal?.throwIfAborted()
      if (!res.ok) return this.getIndexFallbackQuote(originalSymbol, options)

      const json = await res.json()
      options.signal?.throwIfAborted()
      if (options.freshness === 'live' && !Array.isArray(json?.results)) {
        throw new Error('Massive returned an invalid index quote payload')
      }
      const results: any[] = Array.isArray(json?.results) ? json.results : []
      if (results.length === 0) {
        return this.getIndexFallbackQuote(originalSymbol, options)
      }
      const rawSymbol = typeof results[0]?.ticker === 'string'
        ? results[0].ticker
        : ''
      if (!providerQuoteSymbolsMatch(rawSymbol, massiveSymbol)) {
        const mismatch = new ProviderQuoteSymbolMismatchError(
          'Massive',
          massiveSymbol,
          rawSymbol,
        )
        if (options.freshness === 'live') throw mismatch
        console.error(`[massive] ${mismatch.message}`)
        return null
      }

      const quote = mapIndexSnapshot(results[0], originalSymbol)
      assertLiveQuote(quote, options, 'Massive')
      return quote
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (err instanceof ProviderQuoteSymbolMismatchError) throw err
      console.error(`[massive] getIndexQuote error for ${originalSymbol}:`, safeErrorMessage(err))
      return this.getIndexFallbackQuote(originalSymbol, options)
    }
  }

  private async getFuturesQuote(
    originalSymbol: string,
    productCode: string,
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote | null> {
    options.signal?.throwIfAborted()
    try {
      const contractTicker = await resolveFrontMonth(productCode, options)
      options.signal?.throwIfAborted()
      if (!contractTicker) {
        return this.getFuturesFallbackQuote(originalSymbol, options)
      }

      const snap = await getFuturesSnapshot(contractTicker, options)
      options.signal?.throwIfAborted()
      if (!snap) {
        return this.getFuturesFallbackQuote(originalSymbol, options)
      }

      // Derive the display name from the FMP futures table
      const nameMap: Record<string, string> = {
        'ES=F': 'S&P 500',
        'NQ=F': 'Nasdaq 100',
        'YM=F': 'Dow',
        'RTY=F': 'Russell 2000',
        'CL=F': 'Crude Oil',
        'NG=F': 'Natural Gas',
        'GC=F': 'Gold',
        'SI=F': 'Silver',
      }

      const quote: ProviderQuote = {
        symbol: originalSymbol,
        name: nameMap[originalSymbol] ?? originalSymbol,
        price: snap.price,
        change: snap.change,
        changesPercentage: snap.changePercent,
        volume: snap.volume,
        dayHigh: snap.high,
        dayLow: snap.low,
      }
      assertLiveQuote(quote, options, 'Massive')
      return quote
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (err instanceof ProviderQuoteSymbolMismatchError) throw err
      console.error(`[massive] getFuturesQuote error for ${originalSymbol}:`, safeErrorMessage(err))
      return this.getFuturesFallbackQuote(originalSymbol, options)
    }
  }

  private getFmpFallbackProvider(): FMPProvider {
    if (!this.fmpFallbackProvider) {
      this.fmpFallbackProvider = new FMPProvider()
    }
    return this.fmpFallbackProvider
  }

  private async getIndexFallbackQuote(
    symbol: string,
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote | null> {
    options.signal?.throwIfAborted()
    try {
      return await this.getFmpFallbackProvider().getQuote(symbol, options)
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (options.freshness === 'live') throw err
      console.error(`[massive] index quote fallback failed for ${symbol}:`, safeErrorMessage(err))
      return null
    }
  }

  private async getIndexFallbackCandles(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    const provider = this.getFmpFallbackProvider()

    try {
      if (timespan === 'minute' || timespan === 'hour') {
        return await provider.getIntraday(symbol, multiplier, timespan, from, to, options)
      }

      const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return await provider.getHistoricalDaily(symbol, fromParam, to, options)
    } catch (err) {
      options.signal?.throwIfAborted()
      if (options.failureMode === 'throw') throw err
      console.error(`[massive] index candle fallback failed for ${symbol}:`, safeErrorMessage(err))
      return []
    }
  }

  private async getFuturesFallbackQuote(
    symbol: string,
    options: QuoteRequestOptions = {},
  ): Promise<ProviderQuote | null> {
    options.signal?.throwIfAborted()
    try {
      return await this.getFmpFallbackProvider().getQuote(symbol, options)
    } catch (err) {
      rethrowAbort(err, options.signal)
      if (options.freshness === 'live') throw err
      console.error(`[massive] futures quote fallback failed for ${symbol}:`, safeErrorMessage(err))
      return null
    }
  }

  private async getFuturesFallbackCandles(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
    options: CandleRequestOptions = {},
  ): Promise<ProviderCandle[]> {
    const provider = this.getFmpFallbackProvider()

    try {
      if (timespan === 'minute' || timespan === 'hour') {
        return await provider.getIntraday(symbol, multiplier, timespan, from, to, options)
      }

      if (timespan === 'day' || timespan === 'week' || timespan === 'month') {
        const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        return await provider.getHistoricalDaily(symbol, fromParam, to, options)
      }

      return []
    } catch (err) {
      options.signal?.throwIfAborted()
      if (options.failureMode === 'throw') throw err
      console.error(`[massive] futures candle fallback failed for ${symbol}:`, safeErrorMessage(err))
      return []
    }
  }
}
