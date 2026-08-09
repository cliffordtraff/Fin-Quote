'use server'

import { getProvider } from '@/lib/providers'
import type { CandleRequestOptions } from '@/lib/providers/types'
import { safeErrorMessage } from '@/lib/safe-logging'
import {
  getSP500Losers,
  getSP500LosersWithStatus,
} from './sp500-movers'

export interface SP500LoserSparklineData {
  symbol: string
  changesPercentage: number
  priceHistory: Array<{ date: string; close: number }>
}

/**
 * Fetch intraday price data for top 4 S&P 500 losers
 */
async function loadSP500LoserSparklines(
  loadLosers: typeof getSP500Losers,
  candleOptions: CandleRequestOptions = {},
): Promise<{ sparklines?: SP500LoserSparklineData[]; error?: string }> {
  try {
    // Get the S&P 500 losers (already filtered to S&P 500 stocks)
    const losersResult = await loadLosers()

    if ('error' in losersResult || !losersResult.losers) {
      return { error: 'Failed to load S&P 500 losers' }
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
      const intradayData = candleOptions.failureMode || candleOptions.signal
        ? await provider.getIntraday(
          loser.symbol,
          5,
          'minute',
          undefined,
          undefined,
          candleOptions,
        )
        : await provider.getIntraday(loser.symbol, 5, 'minute')

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

export async function getSP500LoserSparklines(): Promise<{ sparklines?: SP500LoserSparklineData[]; error?: string }> {
  return loadSP500LoserSparklines(getSP500Losers)
}

export async function getSP500LoserSparklinesWithStatus(): Promise<{ sparklines?: SP500LoserSparklineData[]; error?: string }> {
  return loadSP500LoserSparklines(
    getSP500LosersWithStatus,
    { failureMode: 'throw' },
  )
}
