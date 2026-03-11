'use server'

import { getProvider } from '@/lib/providers'

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
    // Get all symbols except the current one
    let symbols = Object.keys(DISCOVER_STOCKS)
    if (excludeSymbol) {
      symbols = symbols.filter(
        (s) => s.toUpperCase() !== excludeSymbol.toUpperCase()
      )
    }

    // Shuffle and take the first `limit` symbols
    const shuffled = symbols.sort(() => Math.random() - 0.5).slice(0, limit)

    const provider = getProvider()
    const quotes = await provider.getQuotes(shuffled)

    if (quotes.length === 0) {
      return { stocks: [], error: 'No stock data returned' }
    }

    // Transform to DiscoverStock format
    const stocks: DiscoverStock[] = quotes.map((q) => ({
      symbol: q.symbol,
      name: DISCOVER_STOCKS[q.symbol] || q.name || q.symbol,
      price: q.price,
      change: q.change,
      changePercent: q.changesPercentage,
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
