'use server'

import { getProvider } from '@/lib/providers'
import type { ProviderQuote } from '@/lib/providers/types'
import { DASHBOARD_STOCK_SYMBOLS } from '@/lib/dashboard-fixed-panels'
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

const STOCK_SYMBOLS = DASHBOARD_STOCK_SYMBOLS

export interface StocksDataResult {
  stocks: StockData[]
  error?: string
}

function hasCompleteStockQuotePanel(quotes: ProviderQuote[]): boolean {
  const expected = new Set<string>(STOCK_SYMBOLS)
  const seen = new Set<string>()

  return quotes.length === expected.size && quotes.every((quote) => {
    const symbol = quote.symbol.toUpperCase()
    if (
      !expected.has(symbol) ||
      seen.has(symbol) ||
      !Number.isFinite(quote.price) ||
      quote.price <= 0 ||
      !Number.isFinite(quote.change) ||
      !Number.isFinite(quote.changesPercentage)
    ) {
      return false
    }
    seen.add(symbol)
    return true
  }) && seen.size === expected.size
}

async function loadStocksData(
  strict: boolean,
  signal?: AbortSignal,
): Promise<StocksDataResult> {
  try {
    const provider = getProvider()
    const quotes = await provider.getQuotes(
      [...STOCK_SYMBOLS],
      strict ? { failureMode: 'throw', signal } : undefined,
    )

    if (
      quotes.length === 0 ||
      (strict && !hasCompleteStockQuotePanel(quotes))
    ) {
      return { stocks: [], error: 'Incomplete stock data returned' }
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

export async function getStocksData(): Promise<StocksDataResult> {
  return loadStocksData(false)
}

/** Strict snapshot path: transport failures and partial fixed panels are errors. */
export async function getStocksDataWithStatus(
  signal?: AbortSignal,
): Promise<StocksDataResult> {
  return loadStocksData(true, signal)
}
