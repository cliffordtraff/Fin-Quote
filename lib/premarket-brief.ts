import 'server-only'

import { getMarketStatus, getSessionLabel, getTradingDate } from '@/lib/market-hours'
import { getProvider } from '@/lib/providers'
import { FMPProvider } from '@/lib/providers/fmp'
import { MassiveProvider } from '@/lib/providers/massive'
import type { MarketDataProvider, ProviderCandle, ProviderNews, ProviderQuote } from '@/lib/providers/types'
import { createAsyncTTLCache } from '@/lib/async-ttl-cache'
import { unstable_cache } from 'next/cache'
import { getSP500Gainers, getSP500Losers, type SP500MoverData } from '@/app/actions/sp500-movers'

export type PremarketBriefRow = {
  symbol: string
  name: string
  price: number | null
  previousClose: number | null
  yesterdayChangePct: number | null
  afterHoursChangePct: number | null
  premarketChangePct: number | null
  currentChangePct: number | null
  fiveDayChangePct: number | null
  distanceFromTenDayHighPct: number | null
  volume: number | null
}

export type PremarketMover = {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export type CatalystItem = PremarketMover & {
  headline: string | null
  source: string | null
  publishedDate: string | null
  url: string | null
}

export type PremarketBrief = {
  generatedAt: string
  tradingDate: string
  previousTradingDate: string
  sessionLabel: string
  currentTimeET: string
  dataProviderName: 'Massive' | 'FMP'
  indexRows: PremarketBriefRow[]
  futuresRows: PremarketBriefRow[]
  mag7Rows: PremarketBriefRow[]
  semiconductorRows: PremarketBriefRow[]
  sp500Gainers: SP500MoverData[]
  sp500Losers: SP500MoverData[]
  premarketGainers: PremarketMover[]
  premarketLosers: PremarketMover[]
  afterHoursGainers: PremarketMover[]
  afterHoursLosers: PremarketMover[]
  catalysts: CatalystItem[]
  semiRead: {
    tone: 'risk-on' | 'mixed' | 'pullback'
    summary: string
    stats: {
      advancers: number
      decliners: number
      averagePremarketPct: number | null
      averageYesterdayPct: number | null
      nearTenDayHighCount: number
    }
  }
  marketNews: ProviderNews[]
}

const MAG7_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA']

const SEMICONDUCTOR_SYMBOLS = [
  'SMH',
  'SOXX',
  'NVDA',
  'AVGO',
  'AMD',
  'MU',
  'QCOM',
  'TXN',
  'AMAT',
  'LRCX',
  'KLAC',
  'INTC',
  'ON',
  'MRVL',
]

const INDEX_SYMBOLS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq Composite' },
  { symbol: '^DJI', name: 'Dow Industrials' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: '^VIX', name: 'VIX' },
]

const FUTURES_SYMBOLS = [
  { symbol: 'ES=F', lookupSymbol: 'ESUSD', name: 'S&P 500 Futures' },
  { symbol: 'NQ=F', lookupSymbol: 'NQUSD', name: 'Nasdaq 100 Futures' },
  { symbol: 'YM=F', lookupSymbol: 'YMUSD', name: 'Dow Futures' },
  { symbol: 'RTY=F', lookupSymbol: 'RTYUSD', name: 'Russell 2000 Futures' },
]

const FMP_EXTENDED_ENDPOINTS = {
  premarketGainers: 'pre_market_gainers',
  premarketLosers: 'pre_market_losers',
  afterHoursGainers: 'aftermarket_gainers',
  afterHoursLosers: 'aftermarket_losers',
} as const

const getCachedPremarketBrief = createAsyncTTLCache<PremarketBrief>(5 * 60_000)

function shiftDate(dateStr: string, deltaDays: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

function previousTradingDate(dateStr: string): string {
  let candidate = shiftDate(dateStr, -1)
  while (isWeekend(candidate)) {
    candidate = shiftDate(candidate, -1)
  }
  return candidate
}

function dateDaysAgo(dateStr: string, days: number): string {
  return shiftDate(dateStr, -days)
}

function getClockMinutes(candle: ProviderCandle): number | null {
  const time = candle.date.includes(' ') ? candle.date.split(' ')[1] : null
  if (!time) return null

  const [hour, minute] = time.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function isDate(candle: ProviderCandle, dateStr: string): boolean {
  return candle.date.startsWith(dateStr)
}

function sortCandles(candles: ProviderCandle[]): ProviderCandle[] {
  return candles.slice().sort((a, b) => a.timestampMs - b.timestampMs)
}

function percentChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to)) return null
  return ((to - from) / from) * 100
}

function lastFinite(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function normalizeMover(raw: Record<string, unknown>): PremarketMover | null {
  const symbol = String(raw.symbol ?? '')
  const price = Number(raw.price)
  const change = Number(raw.change)
  const changesPercentage = Number(raw.changesPercentage)

  if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(changesPercentage)) {
    return null
  }

  return {
    symbol,
    name: String(raw.name ?? symbol),
    price,
    change: Number.isFinite(change) ? change : 0,
    changesPercentage,
  }
}

function quoteToMover(quote: ProviderQuote): PremarketMover | null {
  if (!quote.symbol || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.changesPercentage)) {
    return null
  }

  return {
    symbol: quote.symbol,
    name: quote.name || quote.symbol,
    price: quote.price,
    change: quote.change,
    changesPercentage: quote.changesPercentage,
  }
}

async function fetchProviderMovers(
  provider: MarketDataProvider,
  direction: 'gainers' | 'losers',
): Promise<PremarketMover[]> {
  try {
    const quotes = direction === 'gainers'
      ? await provider.getGainers()
      : await provider.getLosers()

    return quotes
      .map(quoteToMover)
      .filter((item): item is PremarketMover => item !== null)
      .slice(0, 20)
  } catch (error) {
    console.error(`[premarket-brief] provider ${direction} fallback failed:`, error)
    return []
  }
}

async function fetchFmpExtendedMovers(endpoint: keyof typeof FMP_EXTENDED_ENDPOINTS): Promise<PremarketMover[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/${FMP_EXTENDED_ENDPOINTS[endpoint]}?apikey=${apiKey}`,
      { next: { revalidate: 300 } },
    )

    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data)) return []

    return data
      .map((item) => normalizeMover(item as Record<string, unknown>))
      .filter((item): item is PremarketMover => item !== null)
      .filter((item) => Math.abs(item.changesPercentage) < 500)
      .slice(0, 20)
  } catch (error) {
    console.error(`[premarket-brief] FMP extended mover fetch failed for ${endpoint}:`, error)
    return []
  }
}

function getQuoteForSymbol(quotesBySymbol: Map<string, ProviderQuote>, symbol: string): ProviderQuote | undefined {
  const direct = quotesBySymbol.get(symbol)
  if (direct) return direct

  if (symbol.endsWith('=F')) {
    return quotesBySymbol.get(symbol.replace('=F', 'USD'))
  }

  return undefined
}

function makeProvider(): { provider: MarketDataProvider; name: 'Massive' | 'FMP' } {
  if (process.env.MASSIVE_API_KEY) {
    return { provider: new MassiveProvider(), name: 'Massive' }
  }

  return { provider: getProvider(), name: (process.env.DATA_PROVIDER === 'massive' ? 'Massive' : 'FMP') }
}

async function getQuotesWithFallback(
  primary: MarketDataProvider,
  fallback: FMPProvider,
  symbols: string[],
): Promise<ProviderQuote[]> {
  try {
    const quotes = await primary.getQuotes(symbols)
    if (quotes.length > 0) return quotes
  } catch (error) {
    console.error('[premarket-brief] primary quote fetch failed:', error)
  }

  try {
    return await fallback.getQuotes(symbols)
  } catch (error) {
    console.error('[premarket-brief] FMP quote fallback failed:', error)
    return []
  }
}

async function getDailyCandlesWithFallback(
  primary: MarketDataProvider,
  fallback: FMPProvider,
  symbol: string,
  from: string,
  to: string,
): Promise<ProviderCandle[]> {
  try {
    const candles = await primary.getHistoricalDaily(symbol, from, to)
    if (candles.length > 0) return candles
  } catch (error) {
    console.error(`[premarket-brief] primary daily fetch failed for ${symbol}:`, error)
  }

  try {
    return await fallback.getHistoricalDaily(symbol, from, to)
  } catch (error) {
    console.error(`[premarket-brief] FMP daily fallback failed for ${symbol}:`, error)
    return []
  }
}

async function getIntradayCandlesWithFallback(
  primary: MarketDataProvider,
  fallback: FMPProvider,
  symbol: string,
  from: string,
  to: string,
): Promise<ProviderCandle[]> {
  try {
    const candles = await primary.getIntraday(symbol, 5, 'minute', from, to)
    if (candles.length > 0) return candles
  } catch (error) {
    console.error(`[premarket-brief] primary intraday fetch failed for ${symbol}:`, error)
  }

  try {
    return await fallback.getIntraday(symbol, 5, 'minute', from, to)
  } catch (error) {
    console.error(`[premarket-brief] FMP intraday fallback failed for ${symbol}:`, error)
    return []
  }
}

async function buildRows(
  primary: MarketDataProvider,
  fallback: FMPProvider,
  symbols: Array<{ symbol: string; name?: string; lookupSymbol?: string }>,
  tradingDate: string,
  previousDate: string,
): Promise<PremarketBriefRow[]> {
  const symbolItems = Array.from(
    new Map(symbols.map((item) => [item.symbol, item])).values(),
  )
  const lookupSymbols = Array.from(new Set(symbolItems.map((item) => item.lookupSymbol ?? item.symbol)))
  const quotes = await getQuotesWithFallback(primary, fallback, lookupSymbols)
  const quotesBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]))
  const historyFrom = dateDaysAgo(tradingDate, 35)

  return Promise.all(symbolItems.map(async (item) => {
    const symbol = item.symbol
    const lookupSymbol = item.lookupSymbol ?? item.symbol
    const quote = getQuoteForSymbol(quotesBySymbol, symbol) ?? getQuoteForSymbol(quotesBySymbol, lookupSymbol)
    const [dailyRaw, intradayRaw] = await Promise.all([
      getDailyCandlesWithFallback(primary, fallback, lookupSymbol, historyFrom, tradingDate),
      getIntradayCandlesWithFallback(primary, fallback, lookupSymbol, previousDate, tradingDate),
    ])

    const daily = sortCandles(dailyRaw)
    const completedDaily = daily.filter((candle) => candle.date < tradingDate)
    const previousDaily = completedDaily[completedDaily.length - 1] ?? null
    const priorDaily = completedDaily[completedDaily.length - 2] ?? null
    const recentDaily = completedDaily.slice(-11)

    const regularClose = previousDaily?.close ?? quote?.previousClose ?? null
    const yesterdayChangePct = percentChange(priorDaily?.close, previousDaily?.close)
    const fiveDayBase = recentDaily.length >= 6 ? recentDaily[recentDaily.length - 6].close : null
    const fiveDayChangePct = percentChange(fiveDayBase, previousDaily?.close)
    const tenDayHigh = recentDaily.length > 0 ? Math.max(...recentDaily.slice(-10).map((candle) => candle.high)) : null
    const distanceFromTenDayHighPct = tenDayHigh ? percentChange(tenDayHigh, quote?.price ?? previousDaily?.close) : null

    const intraday = sortCandles(intradayRaw)
    const afterHours = intraday.filter((candle) => {
      const minutes = getClockMinutes(candle)
      return isDate(candle, previousDate) && minutes !== null && minutes >= 16 * 60 && minutes < 20 * 60
    })
    const premarket = intraday.filter((candle) => {
      const minutes = getClockMinutes(candle)
      return isDate(candle, tradingDate) && minutes !== null && minutes >= 4 * 60 && minutes < 9 * 60 + 30
    })

    const afterHoursPrice = lastFinite(afterHours.map((candle) => candle.close))
    const premarketPrice = lastFinite(premarket.map((candle) => candle.close))
    const currentPrice = quote?.price ?? premarketPrice ?? afterHoursPrice ?? previousDaily?.close ?? null

    return {
      symbol,
      name: item.name ?? quote?.name ?? symbol,
      price: currentPrice,
      previousClose: regularClose,
      yesterdayChangePct,
      afterHoursChangePct: percentChange(regularClose, afterHoursPrice),
      premarketChangePct: percentChange(regularClose, premarketPrice ?? currentPrice),
      currentChangePct: quote?.changesPercentage ?? percentChange(regularClose, currentPrice),
      fiveDayChangePct,
      distanceFromTenDayHighPct,
      volume: quote?.volume ?? null,
    }
  }))
}

function buildSemiRead(rows: PremarketBriefRow[]): PremarketBrief['semiRead'] {
  const stockRows = rows.filter((row) => !['SMH', 'SOXX'].includes(row.symbol))
  const premarketValues = stockRows
    .map((row) => row.premarketChangePct ?? row.currentChangePct)
    .filter((value): value is number => value !== null && Number.isFinite(value))
  const yesterdayValues = stockRows
    .map((row) => row.yesterdayChangePct)
    .filter((value): value is number => value !== null && Number.isFinite(value))

  const advancers = premarketValues.filter((value) => value > 0).length
  const decliners = premarketValues.filter((value) => value < 0).length
  const averagePremarketPct = premarketValues.length
    ? premarketValues.reduce((sum, value) => sum + value, 0) / premarketValues.length
    : null
  const averageYesterdayPct = yesterdayValues.length
    ? yesterdayValues.reduce((sum, value) => sum + value, 0) / yesterdayValues.length
    : null
  const nearTenDayHighCount = stockRows.filter((row) => {
    const distance = row.distanceFromTenDayHighPct
    return distance !== null && distance > -1
  }).length

  let tone: PremarketBrief['semiRead']['tone'] = 'mixed'
  if (averagePremarketPct !== null && averagePremarketPct <= -0.6 && decliners > advancers) {
    tone = 'pullback'
  } else if (averagePremarketPct !== null && averagePremarketPct >= 0.4 && advancers > decliners) {
    tone = 'risk-on'
  }

  const summary = (() => {
    if (averagePremarketPct === null) {
      return 'Semiconductor pre-market breadth is not available yet; use the live quotes below as they populate.'
    }

    if (tone === 'pullback') {
      return `Semiconductors are leaning lower before the open: ${decliners} of ${premarketValues.length} tracked names are red with an average pre-market move of ${averagePremarketPct.toFixed(2)}%. That is the setup you would expect if the group is starting a short-term pullback.`
    }

    if (tone === 'risk-on') {
      return `Semiconductors are still being bought before the open: ${advancers} of ${premarketValues.length} tracked names are green with an average pre-market move of ${averagePremarketPct.toFixed(2)}%. That argues against a clean topping signal so far.`
    }

    return `Semiconductors are mixed before the open: ${advancers} advancers and ${decliners} decliners with an average pre-market move of ${averagePremarketPct.toFixed(2)}%. This is watch-list territory rather than a clear top by itself.`
  })()

  return {
    tone,
    summary,
    stats: {
      advancers,
      decliners,
      averagePremarketPct,
      averageYesterdayPct,
      nearTenDayHighCount,
    },
  }
}

async function buildCatalysts(provider: MarketDataProvider, movers: PremarketMover[]): Promise<CatalystItem[]> {
  const topMovers = movers
    .slice()
    .sort((a, b) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage))
    .slice(0, 5)

  return Promise.all(topMovers.map(async (mover) => {
    let news: ProviderNews[] = []
    try {
      news = await provider.getNews(mover.symbol, 3)
    } catch (error) {
      console.error(`[premarket-brief] catalyst news failed for ${mover.symbol}:`, error)
    }

    const headline = news[0] ?? null
    return {
      ...mover,
      headline: headline?.title ?? null,
      source: headline?.site ?? null,
      publishedDate: headline?.publishedDate ?? null,
      url: headline?.url ?? null,
    }
  }))
}

async function getMarketNews(provider: MarketDataProvider): Promise<ProviderNews[]> {
  try {
    return await provider.getNews('SPY', 6)
  } catch (error) {
    console.error('[premarket-brief] market news fetch failed:', error)
    return []
  }
}

async function loadPremarketBrief(): Promise<PremarketBrief> {
  const status = getMarketStatus()
  const tradingDate = getTradingDate()
  const previousDate = previousTradingDate(tradingDate)
  const { provider, name } = makeProvider()
  const fmpFallback = new FMPProvider()

  const [
    indexRows,
    futuresRows,
    mag7Rows,
    semiconductorRows,
    sp500GainersResult,
    sp500LosersResult,
    rawPremarketGainers,
    rawPremarketLosers,
    afterHoursGainers,
    afterHoursLosers,
  ] = await Promise.all([
    buildRows(provider, fmpFallback, INDEX_SYMBOLS, tradingDate, previousDate),
    buildRows(fmpFallback, fmpFallback, FUTURES_SYMBOLS, tradingDate, previousDate),
    buildRows(provider, fmpFallback, MAG7_SYMBOLS.map((symbol) => ({ symbol })), tradingDate, previousDate),
    buildRows(provider, fmpFallback, SEMICONDUCTOR_SYMBOLS.map((symbol) => ({ symbol })), tradingDate, previousDate),
    getSP500Gainers(),
    getSP500Losers(),
    fetchFmpExtendedMovers('premarketGainers'),
    fetchFmpExtendedMovers('premarketLosers'),
    fetchFmpExtendedMovers('afterHoursGainers'),
    fetchFmpExtendedMovers('afterHoursLosers'),
  ])

  const [fallbackPremarketGainers, fallbackPremarketLosers] = await Promise.all([
    rawPremarketGainers.length > 0 ? Promise.resolve([]) : fetchProviderMovers(provider, 'gainers'),
    rawPremarketLosers.length > 0 ? Promise.resolve([]) : fetchProviderMovers(provider, 'losers'),
  ])
  const premarketGainers = rawPremarketGainers.length > 0 ? rawPremarketGainers : fallbackPremarketGainers
  const premarketLosers = rawPremarketLosers.length > 0 ? rawPremarketLosers : fallbackPremarketLosers
  const catalystUniverse = [...premarketGainers.slice(0, 5), ...premarketLosers.slice(0, 5)]

  const [catalysts, marketNews] = await Promise.all([
    buildCatalysts(provider, catalystUniverse),
    getMarketNews(provider),
  ])

  return {
    generatedAt: new Date().toISOString(),
    tradingDate,
    previousTradingDate: previousDate,
    sessionLabel: getSessionLabel(status.session),
    currentTimeET: status.currentTimeET,
    dataProviderName: name,
    indexRows,
    futuresRows,
    mag7Rows,
    semiconductorRows,
    sp500Gainers: 'gainers' in sp500GainersResult ? sp500GainersResult.gainers ?? [] : [],
    sp500Losers: 'losers' in sp500LosersResult ? sp500LosersResult.losers ?? [] : [],
    premarketGainers,
    premarketLosers,
    afterHoursGainers,
    afterHoursLosers,
    catalysts,
    semiRead: buildSemiRead(semiconductorRows),
    marketNews,
  }
}

const getPersistedPremarketBrief = unstable_cache(
  loadPremarketBrief,
  ['premarket-brief-v1'],
  { revalidate: 300 },
)

export async function getPremarketBrief(): Promise<PremarketBrief> {
  return getCachedPremarketBrief(getPersistedPremarketBrief)
}
