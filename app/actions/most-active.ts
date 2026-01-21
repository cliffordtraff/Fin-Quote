'use server'

export interface MostActiveStock {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
}

/**
 * Fetch most actively traded stocks from FMP API
 */
export async function getMostActiveData(): Promise<{ mostActive?: MostActiveStock[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch most active stocks')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const mostActive: MostActiveStock[] = data
        .slice(0, 10)
        .filter((item: any) => item.price > 0)
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changesPercentage: item.changesPercentage,
          volume: item.volume || 0
        }))

      return { mostActive }
    }

    return { mostActive: [] }
  } catch (error) {
    console.error('Error fetching most active stocks:', error)
    return { error: 'Failed to load most active stocks' }
  }
}
