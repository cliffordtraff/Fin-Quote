'use server'

import { getProvider } from '@/lib/providers'

export interface LoserData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

/**
 * Fetch top losers by percentage from US stock markets
 */
export async function getLosersData(): Promise<{ losers: LoserData[] } | { error: string }> {
  try {
    const provider = getProvider()
    const quotes = await provider.getLosers()

    const losers: LoserData[] = quotes.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      change: q.change,
      changesPercentage: q.changesPercentage,
    }))

    return { losers }
  } catch (error) {
    console.error('Error fetching losers data:', error)
    return { error: 'Failed to load losers data' }
  }
}
