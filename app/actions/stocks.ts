'use server'

export interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

const STOCK_NAMES: Record<string, string> = {
  'AAPL': 'Apple',
  'NVDA': 'NVIDIA',
  'GOOGL': 'Alphabet',
  'TSLA': 'Tesla',
  'AMD': 'AMD',
  'MSFT': 'Microsoft',
  'META': 'Meta'
}

export async function getStocksData(): Promise<{
  stocks: StockData[]
  error?: string
}> {
  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { stocks: [], error: 'API configuration error' }
    }

    const symbols = ['AAPL', 'NVDA', 'GOOGL', 'TSLA', 'AMD', 'MSFT', 'META']
    const symbolsParam = symbols.join(',')

    // Use the quote endpoint to get real-time data
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbolsParam}?apikey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: 60 }, // Cache for 1 minute
    })

    if (!response.ok) {
      console.error('FMP API error:', response.status, response.statusText)
      return {
        stocks: [],
        error: `API request failed: ${response.status}`,
      }
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      console.error('Unexpected FMP response format:', data)
      return { stocks: [], error: 'Unexpected API response format' }
    }

    // Transform and sort by percentage change (highest to lowest)
    const stocks: StockData[] = data
      .map((item: any) => ({
        symbol: item.symbol,
        name: STOCK_NAMES[item.symbol] || item.symbol,
        price: item.price,
        change: item.change,
        changePercent: item.changesPercentage,
      }))
      .sort((a, b) => b.changePercent - a.changePercent)

    return { stocks }
  } catch (err) {
    console.error('Error fetching stocks data:', err)
    return {
      stocks: [],
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
