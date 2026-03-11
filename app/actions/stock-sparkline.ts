'use server'

import { getProvider } from '@/lib/providers'

export interface StockSparklineData {
  symbol: string
  changesPercentage: number
  priceHistory: Array<{ date: string; close: number }>
}

/**
 * Fetch intraday price data for a specific stock
 */
export async function getStockSparkline(symbol: string): Promise<{ sparkline?: StockSparklineData; error?: string }> {
  try {
    const provider = getProvider()

    // Get quote for the percentage change
    const quote = await provider.getQuote(symbol)
    const changesPercentage = quote?.changesPercentage ?? 0

    // Get 5-min intraday data via provider
    const intradayData = await provider.getIntraday(symbol, 5, 'minute')

    if (intradayData.length === 0) {
      return { error: 'Failed to fetch intraday data' }
    }

    // Data comes newest-first; get the most recent trading day's data
    const mostRecentDate = intradayData[0]?.date?.split(' ')[0]

    const todayData = intradayData
      .filter((d) => d.date.startsWith(mostRecentDate))
      .reverse()
      .map((d) => ({
        date: d.date,
        close: d.close
      }))

    return {
      sparkline: {
        symbol,
        changesPercentage,
        priceHistory: todayData
      }
    }
  } catch (error) {
    console.error(`Error fetching sparkline for ${symbol}:`, error)
    return { error: `Failed to load sparkline for ${symbol}` }
  }
}
