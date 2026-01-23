'use server'

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
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Get the S&P 500 gainers (already filtered to S&P 500 stocks)
    const gainersResult = await getSP500Gainers()

    if ('error' in gainersResult || !gainersResult.gainers) {
      console.log('SP500 Gainer Sparklines: No gainers data')
      return { sparklines: [] }
    }

    // Take top 4 S&P 500 gainers
    const top4 = gainersResult.gainers.slice(0, 4)
    console.log('SP500 Gainer Sparklines: Top 4 symbols:', top4.map(g => g.symbol))

    if (top4.length === 0) {
      return { sparklines: [] }
    }

    // Fetch intraday data for each of the top 4
    const sparklines: SP500GainerSparklineData[] = []

    for (const gainer of top4) {
      const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/5min/${gainer.symbol}?apikey=${apiKey}`
      const intradayResponse = await fetch(intradayUrl, { next: { revalidate: 60 } })

      if (intradayResponse.ok) {
        const intradayData = await intradayResponse.json()

        // Get the most recent trading day's data
        // First, find the most recent date in the data
        const mostRecentDate = intradayData[0]?.date?.split(' ')[0]
        console.log(`SP500 Gainer Sparklines: ${gainer.symbol} most recent date: ${mostRecentDate}`)

        const todayData = intradayData
          .filter((d: any) => d.date.startsWith(mostRecentDate))
          .reverse() // Oldest first for charting
          .map((d: any) => ({
            date: d.date,
            close: d.close
          }))

        console.log(`SP500 Gainer Sparklines: ${gainer.symbol} has ${todayData.length} data points`)

        sparklines.push({
          symbol: gainer.symbol,
          changesPercentage: gainer.changesPercentage,
          priceHistory: todayData
        })
      }
    }

    console.log('SP500 Gainer Sparklines: Returning', sparklines.length, 'sparklines')
    return { sparklines }
  } catch (error) {
    console.error('Error fetching S&P 500 gainer sparklines:', error)
    return { error: 'Failed to load S&P 500 gainer sparklines' }
  }
}
