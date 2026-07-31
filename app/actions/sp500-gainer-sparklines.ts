'use server'

import { getProvider } from '@/lib/providers'
import { safeErrorMessage } from '@/lib/safe-logging'
import { getSP500Gainers } from './sp500-movers'

export interface SP500GainerSparklineData {
  symbol: string
  changesPercentage: number
  priceHistory: Array<{ date: string; close: number }>
}

/**
 * Fetch intraday price data for top 4 S&P 500 gainers
 */
export async function getSP500GainerSparklines(): Promise<{ sparklines?: SP500GainerSparklineData[]; error?: string }> {
  try {
    // Get the S&P 500 gainers (already filtered to S&P 500 stocks)
    const gainersResult = await getSP500Gainers()

    if ('error' in gainersResult || !gainersResult.gainers) {
      return { sparklines: [] }
    }

    // Take top 4 S&P 500 gainers
    const top4 = gainersResult.gainers.slice(0, 4)

    if (top4.length === 0) {
      return { sparklines: [] }
    }

    const provider = getProvider()

    // Fetch intraday data for each of the top 4
    const sparklines: SP500GainerSparklineData[] = []

    for (const gainer of top4) {
      const intradayData = await provider.getIntraday(gainer.symbol, 5, 'minute')

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
          symbol: gainer.symbol,
          changesPercentage: gainer.changesPercentage,
          priceHistory: todayData
        })
      }
    }

    return { sparklines }
  } catch (error) {
    console.error('Error fetching S&P 500 gainer sparklines:', safeErrorMessage(error))
    return { error: 'Failed to load S&P 500 gainer sparklines' }
  }
}
