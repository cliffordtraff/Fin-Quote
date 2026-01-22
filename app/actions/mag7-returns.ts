'use server'

export interface Mag7StockReturn {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

const MAG7_SYMBOLS = ['AAPL', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META', 'MSFT']

const MAG7_NAMES: Record<string, string> = {
  AAPL: 'Apple',
  NVDA: 'NVIDIA',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
  META: 'Meta',
  MSFT: 'Microsoft',
}

/**
 * Fetch daily percentage returns for the Magnificent 7 stocks
 */
export async function getMag7Returns(): Promise<{ data: Mag7StockReturn[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Fetch quotes for all Mag 7 stocks
    const symbolsParam = MAG7_SYMBOLS.join(',')
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbolsParam}?apikey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch Mag 7 data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      const returns: Mag7StockReturn[] = data.map((item: any) => ({
        symbol: item.symbol,
        name: MAG7_NAMES[item.symbol] || item.name,
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage,
      }))

      // Sort by percentage change (descending)
      returns.sort((a, b) => b.changesPercentage - a.changesPercentage)

      return { data: returns }
    }

    return { data: [] }
  } catch (error) {
    console.error('Error fetching Mag 7 returns:', error)
    return { error: 'Failed to load Mag 7 data' }
  }
}
