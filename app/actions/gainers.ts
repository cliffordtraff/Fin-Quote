'use server'

export interface GainerData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

/**
 * Fetch top gainers by percentage from US stock markets using FMP's stock_market/gainers endpoint
 */
export async function getGainersData(): Promise<{ gainers: GainerData[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch gainers data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      // Filter out bad data and map to GainerData format
      const gainers: GainerData[] = data
        .filter((item: any) => {
          // Filter out unrealistic percentage changes (likely bad data)
          // and stocks with no price
          const pctChange = Math.abs(item.changesPercentage || 0)
          return pctChange < 1000 && item.price > 0
        })
        .slice(0, 20) // Take top 20
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changesPercentage: item.changesPercentage,
        }))

      return { gainers }
    }

    return { gainers: [] }
  } catch (error) {
    console.error('Error fetching gainers data:', error)
    return { error: 'Failed to load gainers data' }
  }
}
