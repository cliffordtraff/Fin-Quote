'use server'

import { getProvider } from '@/lib/providers'
import { getTradingDate } from '@/lib/market-hours'
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

function shiftDateString(dateStr: string, deltaDays: number): string {
  const shifted = new Date(`${dateStr}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays)
  return shifted.toISOString().split('T')[0]
}

function compareByDateAsc(a: { date: string }, b: { date: string }) {
  return a.date.localeCompare(b.date)
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

    // Fetch a narrow ET-aligned window and let the split logic choose the latest session.
    const marketDate = getTradingDate()
    const lookbackStart = shiftDateString(marketDate, -4)

    // Fetch quote and candles in parallel
    const [quote, intradayData] = await Promise.all([
      provider.getQuote(symbol),
      provider.getIntraday(symbol, minuteMultiplier, 'minute', lookbackStart, marketDate),
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

      // Normalize to chronological order regardless of provider response ordering.
      const filtered = intradayData
        .filter((c) => {
          const d = c.date.split(' ')[0]
          return d === today || d === previousDay
        })
        .sort(compareByDateAsc)

      // Yesterday candles (already 5-min, no aggregation needed)
      if (previousDay) {
        const prevDayCandles = filtered.filter((c) => c.date.split(' ')[0] === previousDay)
        yesterdayOHLC = prevDayCandles
          .map((c) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))

        // Previous close = last candle of previous day (latest timestamp)
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
