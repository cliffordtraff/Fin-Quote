'use server'

export interface StockSparklineData {
  symbol: string
  changesPercentage: number
  priceHistory: Array<{ date: string; close: number }>
}

/**
 * Fetch intraday price data for a specific stock
 */
export async function getStockSparkline(symbol: string): Promise<{ sparkline?: StockSparklineData; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Get quote for the percentage change
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, { next: { revalidate: 60 } })

    let changesPercentage = 0
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json()
      if (quoteData[0]) {
        changesPercentage = quoteData[0].changesPercentage || 0
      }
    }

    // Get intraday data
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/5min/${symbol}?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, { next: { revalidate: 60 } })

    if (!intradayResponse.ok) {
      return { error: 'Failed to fetch intraday data' }
    }

    const intradayData = await intradayResponse.json()

    // Get the most recent trading day's data
    const mostRecentDate = intradayData[0]?.date?.split(' ')[0]

    const todayData = intradayData
      .filter((d: any) => d.date.startsWith(mostRecentDate))
      .reverse()
      .map((d: any) => ({
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
