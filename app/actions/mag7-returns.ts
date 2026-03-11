'use server'

import { getProvider } from '@/lib/providers'

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
  try {
    const provider = getProvider()
    const data = await provider.getQuotes(MAG7_SYMBOLS)

    if (data.length > 0) {
      const returns: Mag7StockReturn[] = data.map((q) => ({
        symbol: q.symbol,
        name: MAG7_NAMES[q.symbol] || q.name,
        price: q.price,
        change: q.change,
        changesPercentage: q.changesPercentage,
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
