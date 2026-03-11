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
 * Fetch 5-min OHLC candles + current quote for any stock symbol.
 * Splits data into yesterday + today using the same date-splitting pattern
 * as sparkline-indices.ts.
 */
export async function getStockIntradayOHLC(
  symbol: string
): Promise<{ data?: StockIntradayOHLC; error?: string }> {
  try {
    const provider = getProvider()

    // Fetch quote and 5-min candles in parallel
    const [quote, intradayData] = await Promise.all([
      provider.getQuote(symbol),
      provider.getIntraday(symbol, 5, 'minute'),
    ])

    if (!quote) {
      return { error: `No quote found for ${symbol}` }
    }

    let yesterdayOHLC: OHLCData[] = []
    let todayOHLC: OHLCData[] = []
    let previousClose: number | null = null

    if (intradayData.length > 0) {
      // Data comes newest first — get unique dates
      const uniqueDates = [
        ...new Set(
          intradayData.map((c) => c.date.split(' ')[0])
        ),
      ] as string[]

      const today = uniqueDates[0]
      const previousDay = uniqueDates.length > 1 ? uniqueDates[1] : null

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

        // Previous close = last candle of previous day (newest first in raw data)
        const prevDayCandle = intradayData.find(
          (c) => c.date.split(' ')[0] === previousDay
        )
        if (prevDayCandle) {
          previousClose = prevDayCandle.close
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
        previousClose,
      },
    }
  } catch (error) {
    console.error(`Error fetching intraday OHLC for ${symbol}:`, error)
    return { error: `Failed to load data for ${symbol}` }
  }
}
