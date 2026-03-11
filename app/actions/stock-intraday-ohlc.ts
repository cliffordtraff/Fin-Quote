'use server'

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
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Fetch quote and 5-min candles in parallel
    const [quoteResponse, intradayResponse] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
        { cache: 'no-store' }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v3/historical-chart/5min/${symbol}?apikey=${apiKey}`,
        { cache: 'no-store' }
      ),
    ])

    if (!quoteResponse.ok || !intradayResponse.ok) {
      return { error: `Failed to fetch data for ${symbol}` }
    }

    const [quoteData, intradayData] = await Promise.all([
      quoteResponse.json(),
      intradayResponse.json(),
    ])

    const quote = quoteData[0]
    if (!quote) {
      return { error: `No quote found for ${symbol}` }
    }

    let yesterdayOHLC: OHLCData[] = []
    let todayOHLC: OHLCData[] = []
    let previousClose: number | null = null

    if (Array.isArray(intradayData) && intradayData.length > 0) {
      // Data comes newest first — get unique dates
      const uniqueDates = [
        ...new Set(
          intradayData.map((c: { date: string }) => c.date.split(' ')[0])
        ),
      ] as string[]

      const today = uniqueDates[0]
      const previousDay = uniqueDates.length > 1 ? uniqueDates[1] : null

      // Filter to only today + previous day, then reverse for chronological order
      const filtered = intradayData
        .filter((c: { date: string }) => {
          const d = c.date.split(' ')[0]
          return d === today || d === previousDay
        })
        .reverse()

      // Yesterday candles (already 5-min from FMP, no aggregation needed)
      if (previousDay) {
        yesterdayOHLC = filtered
          .filter((c: { date: string }) => c.date.split(' ')[0] === previousDay)
          .map((c: { date: string; open: number; high: number; low: number; close: number }) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))

        // Previous close = last candle of previous day (newest first in raw data)
        const prevDayCandle = intradayData.find(
          (c: { date: string }) => c.date.split(' ')[0] === previousDay
        )
        if (prevDayCandle) {
          previousClose = prevDayCandle.close
        }
      }

      // Today candles
      todayOHLC = filtered
        .filter((c: { date: string }) => c.date.split(' ')[0] === today)
        .map((c: { date: string; open: number; high: number; low: number; close: number }) => ({
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
