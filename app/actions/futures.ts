'use server'

// Always use FMP for futures — Massive plan doesn't include futures data
import { FMPProvider } from '@/lib/providers/fmp'
import type {
  CandleRequestOptions,
  ProviderQuote,
  QuoteRequestOptions,
} from '@/lib/providers/types'
import { safeErrorMessage } from '@/lib/safe-logging'

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export interface FutureDataWithSparkline extends FutureData {
  ytdPriceHistory: Array<{ date: string; close: number }>
  ytdChangePercent: number
}

export interface FutureMarketData {
  symbol: string
  name: string
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

// FMP returns futures with 'USD' suffix (e.g. CLUSD) instead of '=F' suffix
// FUTURES_SYMBOLS: commodity subset used for history charts
const FUTURES_SYMBOLS = [
  { symbol: 'CL=F', fmpSymbol: 'CLUSD', name: 'Crude Oil' },
  { symbol: 'NG=F', fmpSymbol: 'NGUSD', name: 'Natural Gas' },
  { symbol: 'GC=F', fmpSymbol: 'GCUSD', name: 'Gold' },
  { symbol: 'SI=F', fmpSymbol: 'SIUSD', name: 'Silver' },
]

// ALL_FUTURES_SYMBOLS: full set including index futures
const ALL_FUTURES_SYMBOLS = [
  { symbol: 'CL=F', fmpSymbol: 'CLUSD', name: 'Crude Oil' },
  { symbol: 'NG=F', fmpSymbol: 'NGUSD', name: 'Natural Gas' },
  { symbol: 'GC=F', fmpSymbol: 'GCUSD', name: 'Gold' },
  { symbol: 'YM=F', fmpSymbol: 'YMUSD', name: 'Dow' },
  { symbol: 'ES=F', fmpSymbol: 'ESUSD', name: 'S&P 500' },
  { symbol: 'NQ=F', fmpSymbol: 'NQUSD', name: 'Nasdaq 100' },
  { symbol: 'RTY=F', fmpSymbol: 'RTYUSD', name: 'Russell 2000' },
]

function hasCompleteFutureQuoteBatch(
  quotes: ProviderQuote[],
  expected: readonly { symbol: string; fmpSymbol: string }[],
): boolean {
  return quotes.length === expected.length && expected.every(({ symbol, fmpSymbol }) => {
    const matches = quotes.filter((quote) =>
      quote.symbol === fmpSymbol || quote.symbol === symbol,
    )
    if (matches.length !== 1) return false
    const [quote] = matches
    return Number.isFinite(quote.price) &&
      quote.price !== 0 &&
      Number.isFinite(quote.change) &&
      Number.isFinite(quote.changesPercentage)
  })
}

export async function getFuturesData() {
  const futuresSymbols = ALL_FUTURES_SYMBOLS

  try {
    const provider = new FMPProvider()
    const symbols = futuresSymbols.map(f => f.fmpSymbol)
    const quotes = await provider.getQuotes(symbols)

    // Map quotes back to our format with display names
    // FMP returns symbols like CLUSD instead of CL=F, so match on fmpSymbol
    const futuresData: FutureData[] = futuresSymbols
      .map(({ symbol, fmpSymbol, name }) => {
        const quote = quotes.find(q => q.symbol === fmpSymbol || q.symbol === symbol)
        if (!quote) return null
        return {
          symbol,
          name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage
        }
      })
      .filter((f): f is FutureData => f !== null)

    return { futures: futuresData }
  } catch (error) {
    console.error('Error fetching futures data:', safeErrorMessage(error))
    return { error: 'Failed to load futures data' }
  }
}

/**
 * Fetch futures data with historical price data for charting
 */
async function loadFuturesWithHistory(
  quoteOptions: QuoteRequestOptions = {},
  candleOptions: CandleRequestOptions = {},
): Promise<{ futuresWithHistory: FutureMarketData[] } | { error: string }> {
  try {
    const provider = new FMPProvider()
    const symbols = FUTURES_SYMBOLS.map(f => f.fmpSymbol)
    const quotes = quoteOptions.freshness || quoteOptions.failureMode || quoteOptions.signal
      ? await provider.getQuotes(symbols, quoteOptions)
      : await provider.getQuotes(symbols)
    if (
      quoteOptions.freshness === 'live' &&
      !hasCompleteFutureQuoteBatch(quotes, FUTURES_SYMBOLS)
    ) {
      throw new Error('FMP returned an incomplete futures quote batch')
    }

    // Calculate a from-date ~60 days back to cover 30 trading days
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const fromDate = sixtyDaysAgo.toISOString().split('T')[0]

    const futuresData = await Promise.all(
      FUTURES_SYMBOLS.map(async ({ symbol, fmpSymbol, name }) => {
        const quote = quotes.find(q => q.symbol === fmpSymbol || q.symbol === symbol)
        if (!quote) return null

        // Fetch daily historical data via provider
        const candles = candleOptions.failureMode || candleOptions.signal
          ? await provider.getHistoricalDaily(fmpSymbol, fromDate, undefined, candleOptions)
          : await provider.getHistoricalDaily(fmpSymbol, fromDate)

        // Candles come newest-first; take 30, reverse for chronological order
        const priceHistory = candles.slice(0, 30).reverse().map(c => ({
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }))

        const date = priceHistory.length > 0
          ? priceHistory[priceHistory.length - 1].date
          : new Date().toISOString().split('T')[0]

        return {
          symbol,
          name,
          currentPrice: quote.price,
          priceChange: quote.change,
          priceChangePercent: quote.changesPercentage,
          date,
          priceHistory
        }
      })
    )

    const validFutures = futuresData.filter((f): f is FutureMarketData => f !== null)

    return { futuresWithHistory: validFutures }
  } catch (error) {
    console.error('Error fetching futures with history:', safeErrorMessage(error))
    return { error: 'Failed to load futures data' }
  }
}

export async function getFuturesWithHistory(): Promise<{ futuresWithHistory: FutureMarketData[] } | { error: string }> {
  return loadFuturesWithHistory()
}

export async function getFuturesWithHistoryWithStatus(): Promise<{ futuresWithHistory: FutureMarketData[] } | { error: string }> {
  return loadFuturesWithHistory(
    { freshness: 'live' },
    { failureMode: 'throw' },
  )
}

/**
 * Fetch futures data with YTD sparkline data
 */
async function loadFuturesWithYTDSparkline(
  quoteOptions: QuoteRequestOptions = {},
  candleOptions: CandleRequestOptions = {},
): Promise<{ futures: FutureDataWithSparkline[] } | { error: string }> {
  // Get start of year date
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`

  const futuresSymbols = ALL_FUTURES_SYMBOLS

  try {
    const provider = new FMPProvider()
    const symbols = futuresSymbols.map(f => f.fmpSymbol)
    const quotes = quoteOptions.freshness || quoteOptions.failureMode || quoteOptions.signal
      ? await provider.getQuotes(symbols, quoteOptions)
      : await provider.getQuotes(symbols)
    if (
      quoteOptions.freshness === 'live' &&
      !hasCompleteFutureQuoteBatch(quotes, futuresSymbols)
    ) {
      throw new Error('FMP returned an incomplete futures quote batch')
    }

    const futuresData = await Promise.all(
      futuresSymbols.map(async ({ symbol, fmpSymbol, name }) => {
        const quote = quotes.find(q => q.symbol === fmpSymbol || q.symbol === symbol)
        if (!quote) return null

        // Fetch YTD historical data via provider
        const candles = candleOptions.failureMode || candleOptions.signal
          ? await provider.getHistoricalDaily(fmpSymbol, yearStart, undefined, candleOptions)
          : await provider.getHistoricalDaily(fmpSymbol, yearStart)

        // Candles come newest-first; reverse for chronological order
        const ytdPriceHistory = candles
          .slice()
          .reverse()
          .map(c => ({ date: c.date, close: c.close }))

        // Calculate YTD change percentage
        let ytdChangePercent = 0
        if (ytdPriceHistory.length >= 2) {
          const firstClose = ytdPriceHistory[0].close
          const lastClose = ytdPriceHistory[ytdPriceHistory.length - 1].close
          ytdChangePercent = ((lastClose - firstClose) / firstClose) * 100
        }

        return {
          symbol,
          name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
          ytdPriceHistory,
          ytdChangePercent
        }
      })
    )

    const validFutures = futuresData.filter((f): f is FutureDataWithSparkline => f !== null)

    return { futures: validFutures }
  } catch (error) {
    console.error('Error fetching futures with YTD sparkline:', safeErrorMessage(error))
    return { error: 'Failed to load futures data' }
  }
}

export async function getFuturesWithYTDSparkline(): Promise<{ futures: FutureDataWithSparkline[] } | { error: string }> {
  return loadFuturesWithYTDSparkline()
}

export async function getFuturesWithYTDSparklineWithStatus(): Promise<{ futures: FutureDataWithSparkline[] } | { error: string }> {
  return loadFuturesWithYTDSparkline(
    { freshness: 'live' },
    { failureMode: 'throw' },
  )
}
