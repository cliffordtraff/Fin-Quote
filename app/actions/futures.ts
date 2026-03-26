'use server'

// Always use FMP for futures — Massive plan doesn't include futures data
import { FMPProvider } from '@/lib/providers/fmp'

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

// Futures symbols with their display names
const FUTURES_SYMBOLS = [
  { symbol: 'CL=F', name: 'Crude Oil' },
  { symbol: 'NG=F', name: 'Natural Gas' },
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'SI=F', name: 'Silver' },
]

export async function getFuturesData() {
  // Futures symbols with their display names
  const futuresSymbols = [
    { symbol: 'CL=F', name: 'Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'YM=F', name: 'Dow' },
    { symbol: 'ES=F', name: 'S&P 500' },
    { symbol: 'NQ=F', name: 'Nasdaq 100' },
    { symbol: 'RTY=F', name: 'Russell 2000' }
  ]

  try {
    const provider = new FMPProvider()
    const symbols = futuresSymbols.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    // Map quotes back to our format with display names
    const futuresData: FutureData[] = futuresSymbols
      .map(({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
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
    console.error('Error fetching futures data:', error)
    return { error: 'Failed to load futures data' }
  }
}

/**
 * Fetch futures data with historical price data for charting
 */
export async function getFuturesWithHistory(): Promise<{ futuresWithHistory: FutureMarketData[] } | { error: string }> {
  try {
    const provider = new FMPProvider()
    const symbols = FUTURES_SYMBOLS.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    // Calculate a from-date ~60 days back to cover 30 trading days
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const fromDate = sixtyDaysAgo.toISOString().split('T')[0]

    const futuresData = await Promise.all(
      FUTURES_SYMBOLS.map(async ({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
        if (!quote) return null

        // Fetch daily historical data via provider
        const candles = await provider.getHistoricalDaily(symbol, fromDate)

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
    console.error('Error fetching futures with history:', error)
    return { error: 'Failed to load futures data' }
  }
}

/**
 * Fetch futures data with YTD sparkline data
 */
export async function getFuturesWithYTDSparkline(): Promise<{ futures: FutureDataWithSparkline[] } | { error: string }> {
  // Get start of year date
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`

  const futuresSymbols = [
    { symbol: 'CL=F', name: 'Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'YM=F', name: 'Dow' },
    { symbol: 'ES=F', name: 'S&P 500' },
    { symbol: 'NQ=F', name: 'Nasdaq 100' },
    { symbol: 'RTY=F', name: 'Russell 2000' }
  ]

  try {
    const provider = new FMPProvider()
    const symbols = futuresSymbols.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    const futuresData = await Promise.all(
      futuresSymbols.map(async ({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
        if (!quote) return null

        // Fetch YTD historical data via provider
        const candles = await provider.getHistoricalDaily(symbol, yearStart)

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
    console.error('Error fetching futures with YTD sparkline:', error)
    return { error: 'Failed to load futures data' }
  }
}
