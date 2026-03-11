'use server'

import { getProvider } from '@/lib/providers'

export interface GainerData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

/**
 * Fetch top gainers by percentage from US stock markets
 */
export async function getGainersData(): Promise<{ gainers: GainerData[] } | { error: string }> {
  try {
    const provider = getProvider()
    const quotes = await provider.getGainers()

    const gainers: GainerData[] = quotes.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      change: q.change,
      changesPercentage: q.changesPercentage,
    }))

    return { gainers }
  } catch (error) {
    console.error('Error fetching gainers data:', error)
    return { error: 'Failed to load gainers data' }
  }
}
