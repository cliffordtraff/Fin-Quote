'use server'

import { getProvider } from '@/lib/providers'
import { safeErrorMessage } from '@/lib/safe-logging'

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
    const symbols = ['AAPL', 'NVDA', 'GOOGL', 'TSLA', 'AMD', 'MSFT', 'META']

    const provider = getProvider()
    const quotes = await provider.getQuotes(symbols)

    if (quotes.length === 0) {
      return { stocks: [], error: 'No stock data returned' }
    }

    // Transform and sort by percentage change (highest to lowest)
    const stocks: StockData[] = quotes
      .map((q) => ({
        symbol: q.symbol,
        name: STOCK_NAMES[q.symbol] || q.name || q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changesPercentage,
      }))
      .sort((a, b) => b.changePercent - a.changePercent)

    return { stocks }
  } catch (err) {
    console.error('Error fetching stocks data:', safeErrorMessage(err))
    return {
      stocks: [],
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
