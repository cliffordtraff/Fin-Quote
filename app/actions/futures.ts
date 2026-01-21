'use server'

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export interface FutureMarketData {
  symbol: string
  name: string
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  date: string
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }>
}

// Futures symbols with their display names
const FUTURES_SYMBOLS = [
  { symbol: 'CL=F', name: 'Crude Oil' },
  { symbol: 'NG=F', name: 'Natural Gas' },
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'SI=F', name: 'Silver' },
]

export async function getFuturesData() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  // Futures symbols with their display names
  const futuresSymbols = [
    { symbol: 'CL=F', name: 'Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'YM=F', name: 'Dow' },
    { symbol: 'ES=F', name: 'S&P 500' },
    { symbol: 'NQ=F', name: 'Nasdaq 100' },
    { symbol: 'RTY=F', name: 'Russell 2000' }
  ]

  try {
    // Fetch all futures data in parallel
    const futuresData = await Promise.all(
      futuresSymbols.map(async ({ symbol, name }) => {
        const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
        const response = await fetch(url, {
          next: { revalidate: 60 } // Cache for 1 minute
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch ${name}`)
        }

        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          const quote = data[0]
          return {
            symbol,
            name,
            price: quote.price,
            change: quote.change,
            changesPercentage: quote.changesPercentage
          }
        }

        return null
      })
    )

    // Filter out any null results
    const validFutures = futuresData.filter((f): f is FutureData => f !== null)

    return { futures: validFutures }
  } catch (error) {
    console.error('Error fetching futures data:', error)
    return { error: 'Failed to load futures data' }
  }
}

/**
 * Fetch futures data with historical price data for charting
 */
export async function getFuturesWithHistory(): Promise<{ futuresWithHistory: FutureMarketData[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const futuresData = await Promise.all(
      FUTURES_SYMBOLS.map(async ({ symbol, name }) => {
        // Fetch quote data
        const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
        const quoteResponse = await fetch(quoteUrl, {
          next: { revalidate: 60 }
        })

        if (!quoteResponse.ok) {
          console.error(`Failed to fetch quote for ${symbol}`)
          return null
        }

        const quoteData = await quoteResponse.json()
        const quote = quoteData[0]

        if (!quote) {
          return null
        }

        // Fetch daily historical data
        const historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${apiKey}`
        const historyResponse = await fetch(historyUrl, {
          next: { revalidate: 3600 } // Cache for 1 hour
        })

        let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

        if (historyResponse.ok) {
          const historyData = await historyResponse.json()
          // Get last 30 trading days, reverse for chronological order
          priceHistory = historyData?.historical?.slice(0, 30).reverse() || []
        }

        const date = priceHistory.length > 0
          ? priceHistory[priceHistory.length - 1].date
          : new Date().toISOString().split('T')[0]

        return {
          symbol,
          name,
          currentPrice: quote.price,
          priceChange: quote.change,
          priceChangePercent: quote.changesPercentage,
          date,
          priceHistory
        }
      })
    )

    const validFutures = futuresData.filter((f): f is FutureMarketData => f !== null)

    return { futuresWithHistory: validFutures }
  } catch (error) {
    console.error('Error fetching futures with history:', error)
    return { error: 'Failed to load futures data' }
  }
}
