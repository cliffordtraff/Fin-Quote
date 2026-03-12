'use server'

import { getProvider } from '@/lib/providers'
import type { OHLCData } from '@/app/actions/sparkline-indices'

export interface StockIntradayOHLC {
  symbol: string
  name: string
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  yesterdayOHLC: OHLCData[]
  todayOHLC: OHLCData[]
  previousClose: number | null
}

/**
 * Fetch intraday OHLC candles + current quote for any stock symbol.
 * Splits data into yesterday + today using the same date-splitting pattern
 * as sparkline-indices.ts.
 *
 * @param symbol  Stock ticker (e.g. "AAPL")
 * @param minuteMultiplier  Candle interval in minutes (default: 5)
 */
export async function getStockIntradayOHLC(
  symbol: string,
  minuteMultiplier: number = 5,
): Promise<{ data?: StockIntradayOHLC; error?: string }> {
  try {
    const provider = getProvider()

    // Only need 3 days of data (today + yesterday + buffer for weekends)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]

    // Fetch quote and candles in parallel
    const [quote, intradayData] = await Promise.all([
      provider.getQuote(symbol),
      provider.getIntraday(symbol, minuteMultiplier, 'minute', threeDaysAgo, today),
    ])

    if (!quote) {
      return { error: `No quote found for ${symbol}` }
    }

    let yesterdayOHLC: OHLCData[] = []
    let todayOHLC: OHLCData[] = []
    let previousClose: number | null = null

    if (intradayData.length > 0) {
      // Get unique dates — pick the two most recent regardless of sort order
      const uniqueDates = [
        ...new Set(
          intradayData.map((c) => c.date.split(' ')[0])
        ),
      ].sort() as string[]

      const today = uniqueDates[uniqueDates.length - 1]
      const previousDay = uniqueDates.length > 1 ? uniqueDates[uniqueDates.length - 2] : null

      // Filter to only today + previous day, then reverse for chronological order
      const filtered = intradayData
        .filter((c) => {
          const d = c.date.split(' ')[0]
          return d === today || d === previousDay
        })
        .reverse()

      // Yesterday candles (already 5-min, no aggregation needed)
      if (previousDay) {
        yesterdayOHLC = filtered
          .filter((c) => c.date.split(' ')[0] === previousDay)
          .map((c) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))

        // Previous close = last candle of previous day (latest timestamp)
        const prevDayCandles = intradayData.filter(
          (c) => c.date.split(' ')[0] === previousDay
        )
        if (prevDayCandles.length > 0) {
          previousClose = prevDayCandles[prevDayCandles.length - 1].close
        }
      }

      // Today candles
      todayOHLC = filtered
        .filter((c) => c.date.split(' ')[0] === today)
        .map((c) => ({
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
    }

    return {
      data: {
        symbol: quote.symbol || symbol,
        name: quote.name || symbol,
        currentPrice: quote.price,
        priceChange: quote.change,
        priceChangePercent: quote.changesPercentage,
        yesterdayOHLC,
        todayOHLC,
        previousClose: quote.previousClose ?? previousClose,
      },
    }
  } catch (error) {
    console.error(`Error fetching intraday OHLC for ${symbol}:`, error)
    return { error: `Failed to load data for ${symbol}` }
  }
}
