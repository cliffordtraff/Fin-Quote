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
} from './types'
import { FMPProvider } from './fmp'
import {
  formatMarketTimestamp,
  resolveSymbol,
  MASSIVE_TO_FMP_SYMBOLS,
} from './utils'
import { resolveFrontMonth, getFuturesSnapshot } from './futures-resolver'
import { safeErrorMessage } from '@/lib/safe-logging'

const MASSIVE_BASE = 'https://api.massive.com'
const TOP_MOVER_CANDIDATE_LIMIT = 60

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

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class MassiveProvider implements MarketDataProvider {
  private fmpFallbackProvider: FMPProvider | null = null

  // ---- Quotes ----

  async getQuote(symbol: string): Promise<ProviderQuote | null> {
    const massiveSymbol = resolveSymbol(symbol)

    // Futures — resolve front-month then snapshot
    if (isFutures(symbol)) {
      return this.getFuturesQuote(symbol, massiveSymbol)
    }

    // Index — use v3 snapshot
    if (isIndex(massiveSymbol)) {
      return this.getIndexQuote(symbol, massiveSymbol)
    }

    // Stock — use v2 snapshot single ticker
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${massiveSymbol}`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return null

      const json = await res.json()
      const ticker = json?.ticker
      if (!ticker) return null

      return mapStockSnapshot(ticker, symbol)
    } catch (err) {
      console.error(`[massive] getQuote error for ${symbol}:`, safeErrorMessage(err))
      return null
    }
  }

  async getQuotes(symbols: string[]): Promise<ProviderQuote[]> {
    if (symbols.length === 0) return []

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
          { headers: authHeaders(), cache: 'no-store' },
        )
        if (res.ok) {
          const json = await res.json()
          const tickers: any[] = json?.tickers ?? []
          // Build a map from Massive ticker → original FMP symbol
          const tickerToOriginal = new Map<string, string>()
          for (let i = 0; i < stocks.length; i++) {
            tickerToOriginal.set(massiveTickers[i], stocks[i])
          }
          for (const t of tickers) {
            const orig = tickerToOriginal.get(t.ticker) ?? t.ticker
            results.push(mapStockSnapshot(t, orig))
          }
        }
      } catch (err) {
        console.error('[massive] getQuotes stock batch error:', safeErrorMessage(err))
      }
    }

    // Fetch indices in batch
    if (indices.length > 0) {
      const massiveTickers = indices.map(s => resolveSymbol(s))
      try {
        const res = await fetch(
          `${MASSIVE_BASE}/v3/snapshot/indices?ticker.any_of=${massiveTickers.join(',')}&limit=250`,
          { headers: authHeaders(), cache: 'no-store' },
        )
        if (res.ok) {
          const json = await res.json()
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
        console.error('[massive] getQuotes index batch error:', safeErrorMessage(err))
      }

      // Some Massive plans return partial or empty results from the batch
      // index endpoint while the single-index snapshot endpoint still works.
      const resolvedSymbols = new Set(results.map(result => result.symbol))
      const missingIndices = indices.filter(symbol => !resolvedSymbols.has(symbol))
      const fallbackQuotes = await Promise.all(
        missingIndices.map(symbol => this.getIndexQuote(symbol, resolveSymbol(symbol))),
      )
      for (const quote of fallbackQuotes) {
        if (quote) results.push(quote)
      }
    }

    // Fetch futures individually (each needs front-month resolution)
    if (futures.length > 0) {
      const futureResults = await Promise.all(
        futures.map(s => this.getFuturesQuote(s, resolveSymbol(s))),
      )
      for (const q of futureResults) {
        if (q) results.push(q)
      }
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
  ): Promise<ProviderCandle[]> {
    return this.fetchAggs(symbol, multiplier, timespan, from, to)
  }

  async getHistoricalDaily(
    symbol: string,
    from: string,
    to?: string,
  ): Promise<ProviderCandle[]> {
    return this.fetchAggs(symbol, 1, 'day', from, to)
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

  async getNews(symbol: string, limit = 5): Promise<ProviderNews[]> {
    const massiveSymbol = resolveSymbol(symbol)
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v2/reference/news?ticker=${massiveSymbol}&limit=${limit}`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return []

      const json = await res.json()
      const articles: any[] = json?.results ?? []

      return articles.map(a => ({
        title: a.title ?? '',
        text: a.description ?? '',
        url: a.article_url ?? '',
        image: a.image_url ?? null,
        publishedDate: a.published_utc ?? '',
        site: a.publisher?.name ?? '',
        symbol,
      }))
    } catch (err) {
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
  ): Promise<ProviderCandle[]> {
    const massiveSymbol = resolveSymbol(symbol)

    // Futures need front-month resolution + dedicated aggs endpoint
    if (isFutures(symbol)) {
      return this.fetchFuturesAggs(symbol, massiveSymbol, multiplier, timespan, from, to)
    }

    // Stocks and indices use the same /v2/aggs endpoint
    const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toParam = to ?? new Date().toISOString().split('T')[0]

    try {
      const url = `${MASSIVE_BASE}/v2/aggs/ticker/${massiveSymbol}/range/${multiplier}/${timespan}/${fromParam}/${toParam}?adjusted=true&sort=asc&limit=50000`
      const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' })
      if (!res.ok) {
        return isIndex(massiveSymbol)
          ? this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to)
          : []
      }

      const json = await res.json()
      const results: any[] = json?.results ?? []

      if (results.length === 0 && isIndex(massiveSymbol)) {
        return this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to)
      }

      return results.map(mapAggCandle)
    } catch (err) {
      console.error(`[massive] fetchAggs error for ${symbol}:`, safeErrorMessage(err))
      return isIndex(massiveSymbol)
        ? this.getIndexFallbackCandles(symbol, multiplier, timespan, from, to)
        : []
    }
  }

  private async fetchFuturesAggs(
    originalSymbol: string,
    productCode: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
  ): Promise<ProviderCandle[]> {
    const contractTicker = await resolveFrontMonth(productCode)
    if (!contractTicker) {
      return this.getFuturesFallbackCandles(originalSymbol, multiplier, timespan, from, to)
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
    const candles = await getFuturesCandles(contractTicker, resolution, from)

    if (candles.length === 0) {
      return this.getFuturesFallbackCandles(originalSymbol, multiplier, timespan, from, to)
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
  ): Promise<ProviderQuote | null> {
    try {
      const res = await fetch(
        `${MASSIVE_BASE}/v3/snapshot/indices?ticker.any_of=${massiveSymbol}&limit=1`,
        { headers: authHeaders(), cache: 'no-store' },
      )
      if (!res.ok) return this.getIndexFallbackQuote(originalSymbol)

      const json = await res.json()
      const results: any[] = json?.results ?? []
      if (results.length === 0) return this.getIndexFallbackQuote(originalSymbol)

      return mapIndexSnapshot(results[0], originalSymbol)
    } catch (err) {
      console.error(`[massive] getIndexQuote error for ${originalSymbol}:`, safeErrorMessage(err))
      return this.getIndexFallbackQuote(originalSymbol)
    }
  }

  private async getFuturesQuote(
    originalSymbol: string,
    productCode: string,
  ): Promise<ProviderQuote | null> {
    const contractTicker = await resolveFrontMonth(productCode)
    if (!contractTicker) {
      return this.getFuturesFallbackQuote(originalSymbol)
    }

    const snap = await getFuturesSnapshot(contractTicker)
    if (!snap) {
      return this.getFuturesFallbackQuote(originalSymbol)
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

    return {
      symbol: originalSymbol,
      name: nameMap[originalSymbol] ?? originalSymbol,
      price: snap.price,
      change: snap.change,
      changesPercentage: snap.changePercent,
      volume: snap.volume,
      dayHigh: snap.high,
      dayLow: snap.low,
    }
  }

  private getFmpFallbackProvider(): FMPProvider {
    if (!this.fmpFallbackProvider) {
      this.fmpFallbackProvider = new FMPProvider()
    }
    return this.fmpFallbackProvider
  }

  private async getIndexFallbackQuote(symbol: string): Promise<ProviderQuote | null> {
    try {
      return await this.getFmpFallbackProvider().getQuote(symbol)
    } catch (err) {
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
  ): Promise<ProviderCandle[]> {
    const provider = this.getFmpFallbackProvider()

    try {
      if (timespan === 'minute' || timespan === 'hour') {
        return await provider.getIntraday(symbol, multiplier, timespan, from, to)
      }

      const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return await provider.getHistoricalDaily(symbol, fromParam, to)
    } catch (err) {
      console.error(`[massive] index candle fallback failed for ${symbol}:`, safeErrorMessage(err))
      return []
    }
  }

  private async getFuturesFallbackQuote(symbol: string): Promise<ProviderQuote | null> {
    try {
      return await this.getFmpFallbackProvider().getQuote(symbol)
    } catch (err) {
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
  ): Promise<ProviderCandle[]> {
    const provider = this.getFmpFallbackProvider()

    try {
      if (timespan === 'minute' || timespan === 'hour') {
        return await provider.getIntraday(symbol, multiplier, timespan, from, to)
      }

      if (timespan === 'day' || timespan === 'week' || timespan === 'month') {
        const fromParam = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        return await provider.getHistoricalDaily(symbol, fromParam, to)
      }

      return []
    } catch (err) {
      console.error(`[massive] futures candle fallback failed for ${symbol}:`, safeErrorMessage(err))
      return []
    }
  }
}
