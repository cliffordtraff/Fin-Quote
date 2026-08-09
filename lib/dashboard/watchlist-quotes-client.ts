import type { StockData } from '@/app/actions/stocks'

type UnknownRecord = Record<string, unknown>

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

/**
 * Validate the complete browser wire contract, including ordered batch identity.
 * A partial or reordered response is unusable because it could attach a price to
 * the wrong watchlist row.
 */
export function parseWatchlistQuoteBatchResponse(
  value: unknown,
  requestedSymbols: readonly string[],
): StockData[] | null {
  if (
    !isPlainRecord(value)
    || !hasExactKeys(value, ['quotes'])
    || !Array.isArray(value.quotes)
    || value.quotes.length !== requestedSymbols.length
  ) {
    return null
  }

  const quotes: StockData[] = []
  for (let index = 0; index < value.quotes.length; index += 1) {
    const rawQuote = value.quotes[index]
    const expectedSymbol = requestedSymbols[index]
    if (
      !isPlainRecord(rawQuote)
      || !hasExactKeys(rawQuote, [
        'symbol',
        'name',
        'price',
        'change',
        'changesPercentage',
      ])
      || rawQuote.symbol !== expectedSymbol
      || typeof rawQuote.name !== 'string'
      || rawQuote.name.length < 1
      || rawQuote.name.length > 240
      || rawQuote.name.trim() !== rawQuote.name
      || typeof rawQuote.price !== 'number'
      || !Number.isFinite(rawQuote.price)
      || rawQuote.price <= 0
      || typeof rawQuote.change !== 'number'
      || !Number.isFinite(rawQuote.change)
      || typeof rawQuote.changesPercentage !== 'number'
      || !Number.isFinite(rawQuote.changesPercentage)
    ) {
      return null
    }

    quotes.push({
      symbol: expectedSymbol,
      name: rawQuote.name,
      price: rawQuote.price,
      change: rawQuote.change,
      changePercent: rawQuote.changesPercentage,
    })
  }

  return quotes
}

export async function fetchWatchlistQuoteBatch(
  symbols: readonly string[],
  signal: AbortSignal,
): Promise<StockData[]> {
  signal.throwIfAborted()
  const response = await fetch('/api/watchlist/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols }),
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  })
  signal.throwIfAborted()
  if (!response.ok) {
    throw new Error(`Watchlist quote request failed with status ${response.status}.`)
  }

  const payload: unknown = await response.json()
  signal.throwIfAborted()
  const quotes = parseWatchlistQuoteBatchResponse(payload, symbols)
  if (!quotes) throw new Error('Watchlist quote response was malformed.')
  return quotes
}
