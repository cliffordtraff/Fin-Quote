/**
 * Shared utilities for the provider abstraction layer.
 *
 * Symbol translation, timestamp formatting, and symbol-type helpers
 * live here so both FMP and Massive providers can reuse them.
 */

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Convert epoch milliseconds to an ET-formatted date string.
 *
 * Returns "YYYY-MM-DD HH:mm:ss" when the time component is non-midnight,
 * or "YYYY-MM-DD" when the candle represents a full day (midnight ET).
 */
export function formatMarketTimestamp(ms: number): string {
  const d = new Date(ms)
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const parts: Record<string, string> = {}
  for (const p of et) {
    parts[p.type] = p.value
  }

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`
  const timeStr = `${parts.hour}:${parts.minute}:${parts.second}`

  // If exactly midnight ET, return date only (daily candle convention)
  if (timeStr === '00:00:00') return dateStr
  return `${dateStr} ${timeStr}`
}

// ---------------------------------------------------------------------------
// Symbol mapping: FMP conventions → Massive conventions
// ---------------------------------------------------------------------------

/**
 * Maps FMP-style index symbols to Massive (Polygon) ticker format.
 *
 * FMP uses `^GSPC`, Massive uses `I:SPX`.
 */
export const FMP_TO_MASSIVE_SYMBOLS: Record<string, string> = {
  // Major US indices
  '^GSPC': 'I:SPX',
  '^DJI': 'I:DJI',
  '^IXIC': 'I:COMP',
  '^RUT': 'I:RUT',
  '^VIX': 'I:VIX',
  // Treasury yields
  '^FVX': 'I:FVX',
  '^TNX': 'I:TNX',
  '^TYX': 'I:TYX',
}

/**
 * Maps Massive index symbols back to FMP-style for consumers that
 * still reference the caret convention internally.
 */
export const MASSIVE_TO_FMP_SYMBOLS: Record<string, string> = Object.fromEntries(
  Object.entries(FMP_TO_MASSIVE_SYMBOLS).map(([fmp, massive]) => [massive, fmp]),
)

/**
 * FMP futures symbols to Massive product codes.
 * FMP uses `ES=F`, Massive uses bare product codes for contract lookup.
 */
export const FMP_FUTURES_TO_PRODUCT: Record<string, string> = {
  'ES=F': 'ES',
  'NQ=F': 'NQ',
  'YM=F': 'YM',
  'RTY=F': 'RTY',
  'CL=F': 'CL',
  'NG=F': 'NG',
  'GC=F': 'GC',
  'SI=F': 'SI',
}

/**
 * Translate an FMP-style symbol to the Massive equivalent.
 *
 * Handles indices (`^GSPC` → `I:SPX`), futures (`ES=F` → product code),
 * and passes stock tickers through unchanged.
 */
export function resolveSymbol(fmpSymbol: string): string {
  // Check explicit index mapping first
  if (FMP_TO_MASSIVE_SYMBOLS[fmpSymbol]) {
    return FMP_TO_MASSIVE_SYMBOLS[fmpSymbol]
  }
  // Futures mapping
  if (FMP_FUTURES_TO_PRODUCT[fmpSymbol]) {
    return FMP_FUTURES_TO_PRODUCT[fmpSymbol]
  }
  // Generic caret-prefix index (not in the explicit table)
  if (fmpSymbol.startsWith('^')) {
    return `I:${fmpSymbol.slice(1)}`
  }
  // Generic futures suffix
  if (fmpSymbol.endsWith('=F')) {
    return fmpSymbol.replace('=F', '')
  }
  // Stock ticker — pass through
  return fmpSymbol
}

// ---------------------------------------------------------------------------
// Symbol type detection
// ---------------------------------------------------------------------------

/** Is this symbol a futures contract? (FMP convention: "ES=F") */
export function isFmpFuturesSymbol(symbol: string): boolean {
  return symbol.endsWith('=F')
}

/** Is this symbol an FMP-style index? (e.g. "^GSPC") */
export function isFmpIndexSymbol(symbol: string): boolean {
  return symbol.startsWith('^')
}

/** Is this symbol a Massive-style index? (e.g. "I:SPX") */
export function isMassiveIndexSymbol(symbol: string): boolean {
  return symbol.startsWith('I:')
}

/** Is this symbol a Massive-style forex pair? (e.g. "C:EURUSD") */
export function isMassiveForexSymbol(symbol: string): boolean {
  return symbol.startsWith('C:')
}

/** Is this symbol a Massive-style crypto? (e.g. "X:BTCUSD") */
export function isMassiveCryptoSymbol(symbol: string): boolean {
  return symbol.startsWith('X:')
}
