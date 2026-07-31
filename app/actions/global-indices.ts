'use server'

import { FMPProvider } from '@/lib/providers/fmp'
import { safeErrorMessage } from '@/lib/safe-logging'

export interface GlobalIndexQuote {
  market: string
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  ytd?: number
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

async function fetchYTDChanges(symbols: string[]): Promise<Map<string, number>> {
  const ytdMap = new Map<string, number>()
  try {
    const key = process.env.FMP_API_KEY
    if (!key) return ytdMap
    const joined = symbols.map(s => encodeURIComponent(s)).join(',')
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock-price-change/${joined}?apikey=${key}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return ytdMap
    const data: Array<{ symbol: string; ytd: number }> = await res.json()
    for (const item of data) {
      if (item.ytd != null) {
        ytdMap.set(item.symbol, item.ytd)
      }
    }
  } catch (error) {
    console.error('Error fetching YTD changes:', safeErrorMessage(error))
  }
  return ytdMap
}

export async function getGlobalIndexQuotes(): Promise<GlobalIndexQuote[]> {
  try {
    // Always use FMP — these are FMP-format international index symbols
    // that don't have Massive/Polygon equivalents
    const provider = new FMPProvider()
    const symbols = Object.values(MARKET_INDEX_MAP).map(m => m.symbol)

    const [data, ytdMap] = await Promise.all([
      provider.getQuotes(symbols),
      fetchYTDChanges(symbols),
    ])

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
          ytd: ytdMap.get(indexInfo.symbol),
        })
      }
    }

    return quotes
  } catch (error) {
    console.error('Error fetching global index quotes:', safeErrorMessage(error))
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
    console.error('Error fetching futures quotes:', safeErrorMessage(error))
    return []
  }
}
