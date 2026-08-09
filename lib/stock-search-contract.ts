import {
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from '@/lib/market-symbol'

export const MAX_STOCK_SEARCH_RESULTS = 10
export const MAX_STOCK_SEARCH_QUERY_LENGTH = 64

export interface StockSearchResult {
  symbol: string
  name: string
}

export interface StockSearchOutcome {
  results: StockSearchResult[]
  source: 'primary' | 'fallback'
}

interface PrimaryStockSearchEnvelope {
  results: StockSearchResult[]
  degraded: false
}

interface DegradedStockSearchEnvelope {
  results: [StockSearchResult, ...StockSearchResult[]]
  degraded: true
}

export type StockSearchEnvelope =
  | PrimaryStockSearchEnvelope
  | DegradedStockSearchEnvelope

export interface StockSearchErrorEnvelope {
  error: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isStockSearchResult(value: unknown): value is StockSearchResult {
  if (!isPlainRecord(value)) return false
  if (typeof value.symbol !== 'string' || typeof value.name !== 'string') {
    return false
  }

  const symbol = value.symbol
  const name = value.name
  return (
    symbol === normalizeMarketSymbol(symbol) &&
    isValidStockPageSymbol(symbol) &&
    name === name.trim() &&
    name.length > 0 &&
    name.length <= 240
  )
}

function isStockSearchResultList(value: unknown): value is StockSearchResult[] {
  if (!Array.isArray(value) || value.length > MAX_STOCK_SEARCH_RESULTS) {
    return false
  }
  const symbols = new Set<string>()
  for (const result of value) {
    if (!isStockSearchResult(result) || symbols.has(result.symbol)) return false
    symbols.add(result.symbol)
  }
  return true
}

export function isStockSearchOutcome(value: unknown): value is StockSearchOutcome {
  return (
    isPlainRecord(value) &&
    (value.source === 'primary' || value.source === 'fallback') &&
    isStockSearchResultList(value.results) &&
    (value.source === 'primary' || value.results.length > 0)
  )
}

export function parseStockSearchEnvelope(value: unknown): StockSearchEnvelope | null {
  if (
    !isPlainRecord(value) ||
    typeof value.degraded !== 'boolean' ||
    !isStockSearchResultList(value.results) ||
    (value.degraded && value.results.length === 0)
  ) {
    return null
  }
  if (value.degraded) {
    return {
      results: value.results as [StockSearchResult, ...StockSearchResult[]],
      degraded: true,
    }
  }
  return { results: value.results, degraded: false }
}

export function createStockSearchEnvelope(
  outcome: StockSearchOutcome,
): StockSearchEnvelope {
  if (outcome.source === 'fallback') {
    const [first, ...remaining] = outcome.results
    if (!first) {
      throw new Error('Fallback stock search must include at least one result.')
    }
    return {
      results: [first, ...remaining],
      degraded: true,
    }
  }
  return { results: outcome.results, degraded: false }
}
