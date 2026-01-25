'use server'

export interface DiscoverStock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

// Popular stocks to show in "Discover more" section
// These are well-known stocks that users may be interested in
const DISCOVER_STOCKS: Record<string, string> = {
  INTC: 'Intel Corp',
  BAC: 'Bank of America Corp',
  ABX: 'Abacus Global Management Inc',
  ADBE: 'Adobe Inc',
  PYPL: 'PayPal Holdings Inc',
  V: 'Visa Inc',
  MA: 'Mastercard Inc',
  JPM: 'JPMorgan Chase & Co',
  NFLX: 'Netflix Inc',
  DIS: 'Walt Disney Co',
  AMZN: 'Amazon.com Inc',
  GOOGL: 'Alphabet Inc',
  MSFT: 'Microsoft Corp',
  NVDA: 'NVIDIA Corp',
  AMD: 'Advanced Micro Devices',
  TSLA: 'Tesla Inc',
  META: 'Meta Platforms Inc',
  CRM: 'Salesforce Inc',
  ORCL: 'Oracle Corp',
  IBM: 'IBM Corp',
}

/**
 * Get a list of stocks for the "Discover more" carousel
 * Excludes the current stock symbol being viewed
 * Returns shuffled list with real-time quotes
 */
export async function getDiscoverStocks(
  excludeSymbol?: string,
  limit: number = 12
): Promise<{
  stocks: DiscoverStock[]
  error?: string
}> {
  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { stocks: [], error: 'API configuration error' }
    }

    // Get all symbols except the current one
    let symbols = Object.keys(DISCOVER_STOCKS)
    if (excludeSymbol) {
      symbols = symbols.filter(
        (s) => s.toUpperCase() !== excludeSymbol.toUpperCase()
      )
    }

    // Shuffle and take the first `limit` symbols
    const shuffled = symbols.sort(() => Math.random() - 0.5).slice(0, limit)
    const symbolsParam = shuffled.join(',')

    // Fetch quotes from FMP
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

    // Transform to DiscoverStock format
    const stocks: DiscoverStock[] = data.map((item: Record<string, unknown>) => ({
      symbol: item.symbol as string,
      name: DISCOVER_STOCKS[item.symbol as string] || (item.name as string) || (item.symbol as string),
      price: item.price as number,
      change: item.change as number,
      changePercent: item.changesPercentage as number,
    }))

    return { stocks }
  } catch (err) {
    console.error('Error fetching discover stocks:', err)
    return {
      stocks: [],
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
