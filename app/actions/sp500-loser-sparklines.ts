'use server'

import { getProvider } from '@/lib/providers'
import { safeErrorMessage } from '@/lib/safe-logging'
import { getSP500Losers } from './sp500-movers'

export interface SP500LoserSparklineData {
  symbol: string
  changesPercentage: number
  priceHistory: Array<{ date: string; close: number }>
}

/**
 * Fetch intraday price data for top 4 S&P 500 losers
 */
export async function getSP500LoserSparklines(): Promise<{ sparklines?: SP500LoserSparklineData[]; error?: string }> {
  try {
    // Get the S&P 500 losers (already filtered to S&P 500 stocks)
    const losersResult = await getSP500Losers()

    if ('error' in losersResult || !losersResult.losers) {
      return { sparklines: [] }
    }

    // Take top 4 S&P 500 losers
    const top4 = losersResult.losers.slice(0, 4)

    if (top4.length === 0) {
      return { sparklines: [] }
    }

    const provider = getProvider()

    // Fetch intraday data for each of the top 4
    const sparklines: SP500LoserSparklineData[] = []

    for (const loser of top4) {
      const intradayData = await provider.getIntraday(loser.symbol, 5, 'minute')

      if (intradayData.length > 0) {
        // Get the most recent trading day's data
        const mostRecentDate = intradayData[0]?.date?.split(' ')[0]

        const todayData = intradayData
          .filter((d) => d.date.startsWith(mostRecentDate))
          .reverse() // Oldest first for charting
          .map((d) => ({
            date: d.date,
            close: d.close
          }))

        sparklines.push({
          symbol: loser.symbol,
          changesPercentage: loser.changesPercentage,
          priceHistory: todayData
        })
      }
    }

    return { sparklines }
  } catch (error) {
    console.error('Error fetching S&P 500 loser sparklines:', safeErrorMessage(error))
    return { error: 'Failed to load S&P 500 loser sparklines' }
  }
}
