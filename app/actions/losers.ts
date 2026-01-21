'use server'

export interface LoserData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

/**
 * Fetch top losers by percentage from US stock markets using FMP's stock_market/losers endpoint
 */
export async function getLosersData(): Promise<{ losers: LoserData[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch losers data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      // Filter out bad data and map to LoserData format
      const losers: LoserData[] = data
        .filter((item: any) => {
          // Filter out unrealistic percentage changes (likely bad data)
          // and stocks with no price
          const pctChange = Math.abs(item.changesPercentage || 0)
          return pctChange < 100 && item.price > 0
        })
        .slice(0, 10) // Take top 10
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changesPercentage: item.changesPercentage,
        }))

      return { losers }
    }

    return { losers: [] }
  } catch (error) {
    console.error('Error fetching losers data:', error)
    return { error: 'Failed to load losers data' }
  }
}
