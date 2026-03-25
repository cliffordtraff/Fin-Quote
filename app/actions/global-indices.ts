'use server'

import { getProvider } from '@/lib/providers'
import { FMPProvider } from '@/lib/providers/fmp'

export interface GlobalIndexQuote {
  market: string
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

// Map market names to their primary index symbols (FMP format)
const MARKET_INDEX_MAP: Record<string, { symbol: string; name: string }> = {
  'Sydney': { symbol: '^AXJO', name: 'ASX 200' },
  'Tokyo': { symbol: '^N225', name: 'Nikkei 225' },
  'Hong Kong': { symbol: '^HSI', name: 'Hang Seng' },
  'Shanghai': { symbol: '000001.SS', name: 'SSE Composite' },
  'Mumbai': { symbol: '^BSESN', name: 'SENSEX' },
  'Frankfurt': { symbol: '^GDAXI', name: 'DAX' },
  'London': { symbol: '^FTSE', name: 'FTSE 100' },
  'New York': { symbol: '^GSPC', name: 'S&P 500' },
}

// Futures symbols for overlay
const FUTURES_MAP: Record<string, { symbol: string; name: string }> = {
  'ES': { symbol: 'ES=F', name: 'S&P 500 Futures' },
  'NQ': { symbol: 'NQ=F', name: 'Nasdaq 100 Futures' },
}

export interface FuturesQuote {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export async function getGlobalIndexQuotes(): Promise<GlobalIndexQuote[]> {
  try {
    const provider = getProvider()
    const symbols = Object.values(MARKET_INDEX_MAP).map(m => m.symbol)
    const data = await provider.getQuotes(symbols)

    if (data.length === 0) {
      return []
    }

    // Map the response to our format
    const quotes: GlobalIndexQuote[] = []

    for (const [market, indexInfo] of Object.entries(MARKET_INDEX_MAP)) {
      const quote = data.find((q) => q.symbol === indexInfo.symbol)
      if (quote) {
        quotes.push({
          market,
          symbol: indexInfo.symbol,
          name: indexInfo.name,
          price: quote.price || 0,
          change: quote.change || 0,
          changesPercentage: quote.changesPercentage || 0,
        })
      }
    }

    return quotes
  } catch (error) {
    console.error('Error fetching global index quotes:', error)
    return []
  }
}

export async function getFuturesQuotes(): Promise<FuturesQuote[]> {
  try {
    // Always use FMP for futures — Massive plan doesn't include futures data
    const provider = new FMPProvider()
    const symbols = Object.values(FUTURES_MAP).map(f => f.symbol)
    const data = await provider.getQuotes(symbols)

    if (data.length === 0) {
      return []
    }

    const quotes: FuturesQuote[] = []

    for (const [key, futuresInfo] of Object.entries(FUTURES_MAP)) {
      const quote = data.find((q) => q.symbol === futuresInfo.symbol)
      if (quote) {
        quotes.push({
          symbol: key,
          name: futuresInfo.name,
          price: quote.price || 0,
          change: quote.change || 0,
          changesPercentage: quote.changesPercentage || 0,
        })
      }
    }

    return quotes
  } catch (error) {
    console.error('Error fetching futures quotes:', error)
    return []
  }
}
