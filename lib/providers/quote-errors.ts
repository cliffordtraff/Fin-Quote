import { normalizeMarketSymbol } from '@/lib/market-symbol'

export class ProviderQuoteSymbolMismatchError extends Error {
  constructor(provider: string, expected: string, actual: string) {
    super(`${provider} returned quote symbol ${actual || '(missing)'}; expected ${expected}`)
    this.name = 'ProviderQuoteSymbolMismatchError'
  }
}

export function providerQuoteSymbolsMatch(actual: string, expected: string): boolean {
  return normalizeMarketSymbol(actual) === normalizeMarketSymbol(expected)
}
