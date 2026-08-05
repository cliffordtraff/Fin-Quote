/**
 * FMP (Financial Modeling Prep) implementation of MarketDataProvider.
 *
 * Wraps the existing FMP fetch patterns used across server actions into
 * the provider interface. No behavioral changes — same endpoints, same
 * response mapping, just behind a unified interface.
 */

import type {
  MarketDataProvider,
  ProviderQuote,
  ProviderCandle,
  ProviderNews,
  CandleTimespan,
} from './types'

const FMP_BASE = 'https://financialmodelingprep.com/api'
const FMP_FUTURES_SYMBOLS: Record<string, string> = {
  'ES=F': 'ESUSD',
  'NQ=F': 'NQUSD',
  'YM=F': 'YMUSD',
  'RTY=F': 'RTYUSD',
  'CL=F': 'CLUSD',
  'NG=F': 'NGUSD',
  'GC=F': 'GCUSD',
  'SI=F': 'SIUSD',
}

function getApiKey(): string {
  const key = process.env.FMP_API_KEY
  if (!key) throw new Error('FMP_API_KEY not set')
  return key
}

function toFmpRequestSymbol(symbol: string): string {
  return FMP_FUTURES_SYMBOLS[symbol] ?? symbol
}

const easternPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function easternOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    easternPartsFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return representedAsUtc - instant.getTime()
}

export function parseFmpEasternTimestamp(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/,
  )
  if (!match) return Number.NaN

  const wallClockUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  )
  const firstGuess = wallClockUtc - easternOffsetMs(new Date(wallClockUtc))
  return wallClockUtc - easternOffsetMs(new Date(firstGuess))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a raw FMP quote object to ProviderQuote. */
function mapQuote(raw: Record<string, unknown>): ProviderQuote {
  return {
    symbol: String(raw.symbol ?? ''),
    name: String(raw.name ?? ''),
    price: Number(raw.price ?? 0),
    change: Number(raw.change ?? 0),
    changesPercentage: Number(raw.changesPercentage ?? 0),
    previousClose: raw.previousClose != null ? Number(raw.previousClose) : undefined,
    volume: raw.volume != null ? Number(raw.volume) : undefined,
    dayHigh: raw.dayHigh != null ? Number(raw.dayHigh) : undefined,
    dayLow: raw.dayLow != null ? Number(raw.dayLow) : undefined,
    yearHigh: raw.yearHigh != null ? Number(raw.yearHigh) : undefined,
    yearLow: raw.yearLow != null ? Number(raw.yearLow) : undefined,
    marketCap: raw.marketCap != null ? Number(raw.marketCap) : undefined,
    timestamp: raw.timestamp != null ? Number(raw.timestamp) * 1000 : undefined, // FMP timestamps are seconds
  }
}

/**
 * Map a raw FMP candle to ProviderCandle.
 * FMP returns `date` as "YYYY-MM-DD" (daily) or "YYYY-MM-DD HH:mm:ss" (intraday).
 */
function mapCandle(raw: Record<string, unknown>): ProviderCandle | null {
  const date = String(raw.date ?? '')
  const open = Number(raw.open)
  const high = Number(raw.high)
  const low = Number(raw.low)
  const close = Number(raw.close)
  const volume = Number(raw.volume ?? 0)

  // Filter out invalid candles
  if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null
  }

  // FMP timestamps are New York wall-clock values. Resolve the actual ET
  // offset for that date so summer candles are not shifted by one hour.
  const timestampMs = parseFmpEasternTimestamp(date)
  if (!Number.isFinite(timestampMs)) return null

  return { date, timestampMs, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 }
}

/** Map FMP timespan names to endpoint path segments. */
function fmpCandleEndpoint(multiplier: number, timespan: CandleTimespan): string {
  // FMP uses separate endpoint paths rather than a generic multiplier+timespan
  if (timespan === 'minute') {
    if (multiplier === 1) return 'historical-chart/1min'
    if (multiplier === 5) return 'historical-chart/5min'
    if (multiplier === 15) return 'historical-chart/15min'
    if (multiplier === 30) return 'historical-chart/30min'
    return `historical-chart/${multiplier}min`
  }
  if (timespan === 'hour') {
    if (multiplier === 1) return 'historical-chart/1hour'
    if (multiplier === 4) return 'historical-chart/4hour'
    return `historical-chart/${multiplier}hour`
  }
  // Daily and above use the daily endpoint (aggregation done client-side)
  return 'historical-price-full'
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class FMPProvider implements MarketDataProvider {
  // ---- Quotes ----

  async getQuote(symbol: string): Promise<ProviderQuote | null> {
    const key = getApiKey()
    const requestSymbol = toFmpRequestSymbol(symbol)
    const res = await fetch(`${FMP_BASE}/v3/quote/${encodeURIComponent(requestSymbol)}?apikey=${key}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null

    const data: unknown[] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    return mapQuote(data[0] as Record<string, unknown>)
  }

  async getQuotes(symbols: string[]): Promise<ProviderQuote[]> {
    if (symbols.length === 0) return []
    const key = getApiKey()
    const joined = symbols.map(s => encodeURIComponent(toFmpRequestSymbol(s))).join(',')
    const res = await fetch(`${FMP_BASE}/v3/quote/${joined}?apikey=${key}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const data: unknown[] = await res.json()
    if (!Array.isArray(data)) return []

    return data.map(d => mapQuote(d as Record<string, unknown>))
  }

  // ---- Candles (intraday / custom resolution) ----

  async getIntraday(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
  ): Promise<ProviderCandle[]> {
    const key = getApiKey()
    const endpoint = fmpCandleEndpoint(multiplier, timespan)
    const isDaily = endpoint === 'historical-price-full'
    const requestSymbol = toFmpRequestSymbol(symbol)

    let url = `${FMP_BASE}/v3/${endpoint}/${encodeURIComponent(requestSymbol)}?apikey=${key}`
    if (from) url += `&from=${from}`
    if (to) url += `&to=${to}`

    const revalidate = timespan === 'minute' ? 10 : timespan === 'hour' ? 300 : 3600
    const res = await fetch(url, { next: { revalidate } })
    if (!res.ok) return []

    const json = await res.json()

    // FMP intraday endpoints return arrays directly; daily returns { historical: [] }
    const rawArray: unknown[] = isDaily
      ? (json?.historical ?? [])
      : Array.isArray(json) ? json : []

    return rawArray
      .map(r => mapCandle(r as Record<string, unknown>))
      .filter((c): c is ProviderCandle => c !== null)
  }

  // ---- Candles (historical daily) ----

  async getHistoricalDaily(
    symbol: string,
    from: string,
    to?: string,
  ): Promise<ProviderCandle[]> {
    const key = getApiKey()
    const requestSymbol = toFmpRequestSymbol(symbol)
    let url = `${FMP_BASE}/v3/historical-price-full/${encodeURIComponent(requestSymbol)}?apikey=${key}&from=${from}`
    if (to) url += `&to=${to}`

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []

    const json = await res.json()
    const rawArray: unknown[] = json?.historical ?? []

    return rawArray
      .map(r => mapCandle(r as Record<string, unknown>))
      .filter((c): c is ProviderCandle => c !== null)
  }

  // ---- Gainers / Losers ----

  async getGainers(): Promise<ProviderQuote[]> {
    const key = getApiKey()
    const res = await fetch(`${FMP_BASE}/v3/stock_market/gainers?apikey=${key}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const data: unknown[] = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .filter((item: any) => Math.abs(item.changesPercentage ?? 0) < 1000 && (item.price ?? 0) > 0)
      .slice(0, 60)
      .map(d => mapQuote(d as Record<string, unknown>))
  }

  async getLosers(): Promise<ProviderQuote[]> {
    const key = getApiKey()
    const res = await fetch(`${FMP_BASE}/v3/stock_market/losers?apikey=${key}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const data: unknown[] = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .filter((item: any) => Math.abs(item.changesPercentage ?? 0) < 100 && (item.price ?? 0) > 0)
      .slice(0, 60)
      .map(d => mapQuote(d as Record<string, unknown>))
  }

  // ---- Snapshot ----

  async getSnapshot(tickers?: string[]): Promise<ProviderQuote[]> {
    // FMP doesn't have a dedicated snapshot endpoint — batch quote is equivalent
    if (tickers && tickers.length > 0) {
      return this.getQuotes(tickers)
    }
    // Without tickers, FMP has no full-market snapshot — return empty
    return []
  }

  // ---- News ----

  async getNews(symbol: string, limit = 5): Promise<ProviderNews[]> {
    const key = getApiKey()
    const res = await fetch(
      `${FMP_BASE}/v3/stock_news?tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${key}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return []

    const data: unknown[] = await res.json()
    if (!Array.isArray(data)) return []

    return data.map((item: any) => ({
      title: item.title ?? '',
      text: item.text ?? '',
      url: item.url ?? '',
      image: item.image ?? null,
      publishedDate: item.publishedDate ?? '',
      site: item.site ?? '',
      symbol: item.symbol ?? symbol,
    }))
  }
}
