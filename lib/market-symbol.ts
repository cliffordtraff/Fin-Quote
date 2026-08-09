/**
 * Public market symbols accepted by quote and intraday endpoints.
 *
 * The separator form covers class shares such as BRK.B / BRK-B. The suffix
 * form covers the futures convention already used by this app (for example,
 * ES=F). Keeping this in one place prevents a symbol from working on a stock
 * page while being rejected by its live or replay data endpoint.
 */
export const MARKET_SYMBOL_PATTERN = /^[A-Z][A-Z0-9]{0,9}(?:[.-][A-Z0-9]{1,4}|=[A-Z])?$/

/** Normalize public aliases to the symbol shape used by providers and caches. */
export function normalizeMarketSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-/g, '.')
}

export function isValidMarketSymbol(symbol: string): boolean {
  return MARKET_SYMBOL_PATTERN.test(normalizeMarketSymbol(symbol))
}

/** Stock detail pages exclude generic derivatives such as `ES=F`. */
export function isValidStockPageSymbol(symbol: string): boolean {
  const normalized = normalizeMarketSymbol(symbol)
  return isValidMarketSymbol(normalized) && !normalized.includes('=')
}

/** Convert the canonical UI/database shape to FMP's class-share convention. */
export function toFmpMarketSymbol(symbol: string): string {
  const normalized = normalizeMarketSymbol(symbol)
  return normalized.replace(
    /^([A-Z][A-Z0-9]{0,9})\.([A-Z0-9]{1,4})$/,
    '$1-$2',
  )
}

/**
 * Symbols may have been ingested from canonical sources (`BRK.B`) or directly
 * from FMP (`BRK-B`). Query both shapes under one logical cache/lease key.
 */
export function getMarketSymbolLookupAliases(symbol: string): string[] {
  const canonical = normalizeMarketSymbol(symbol)
  const fmp = toFmpMarketSymbol(canonical)
  return canonical === fmp ? [canonical] : [canonical, fmp]
}
