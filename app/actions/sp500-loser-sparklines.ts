'use server'

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
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Get the S&P 500 losers (already filtered to S&P 500 stocks)
    const losersResult = await getSP500Losers()

    if ('error' in losersResult || !losersResult.losers) {
      console.log('SP500 Loser Sparklines: No losers data')
      return { sparklines: [] }
    }

    // Take top 4 S&P 500 losers
    const top4 = losersResult.losers.slice(0, 4)
    console.log('SP500 Loser Sparklines: Top 4 symbols:', top4.map(l => l.symbol))

    if (top4.length === 0) {
      return { sparklines: [] }
    }

    // Fetch intraday data for each of the top 4
    const sparklines: SP500LoserSparklineData[] = []

    for (const loser of top4) {
      const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/5min/${loser.symbol}?apikey=${apiKey}`
      const intradayResponse = await fetch(intradayUrl, { next: { revalidate: 60 } })

      if (intradayResponse.ok) {
        const intradayData = await intradayResponse.json()

        // Get the most recent trading day's data
        const mostRecentDate = intradayData[0]?.date?.split(' ')[0]

        const todayData = intradayData
          .filter((d: any) => d.date.startsWith(mostRecentDate))
          .reverse() // Oldest first for charting
          .map((d: any) => ({
            date: d.date,
            close: d.close
          }))

        console.log(`SP500 Loser Sparklines: ${loser.symbol} has ${todayData.length} data points`)

        sparklines.push({
          symbol: loser.symbol,
          changesPercentage: loser.changesPercentage,
          priceHistory: todayData
        })
      }
    }

    console.log('SP500 Loser Sparklines: Returning', sparklines.length, 'sparklines')
    return { sparklines }
  } catch (error) {
    console.error('Error fetching S&P 500 loser sparklines:', error)
    return { error: 'Failed to load S&P 500 loser sparklines' }
  }
}
