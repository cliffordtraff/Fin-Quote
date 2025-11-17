/**
 * Request normalization utilities for consistent API handling
 */

/**
 * Normalize symbol strings for consistent processing
 * Examples:
 * "aapl, msft" → ["AAPL", "MSFT"]
 * "MSFT,AAPL,AAPL" → ["AAPL", "MSFT"]
 * " BTC-USD , spy " → ["BTC-USD", "SPY"]
 */
export function normalizeSymbols(symbolString: string | null | undefined): string[] {
  if (!symbolString) return []
  
  return symbolString
    .toUpperCase()                    // Convert to uppercase
    .split(',')                        // Split by comma
    .map(s => s.trim())               // Remove whitespace
    .filter(s => s.length > 0)        // Remove empty strings
    .filter((s, i, arr) => arr.indexOf(s) === i)  // Remove duplicates
    .sort()                           // Alphabetical order for consistency
}

/**
 * Create a consistent cache key from symbols and data type
 */
export function getCacheKey(symbols: string[], dataType: string): string {
  const normalizedSymbols = symbols.sort().join(',')
  return `stocks:${dataType}:${normalizedSymbols}`
}

/**
 * Parse include parameter to determine what data to fetch
 * Example: "quotes,dividends" → ["quotes", "dividends"]
 */
export function parseIncludes(includeString: string | null | undefined): string[] {
  if (!includeString) return ['quotes'] // Default to quotes only
  
  return includeString
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(s => ['quotes', 'dividends', 'news', 'metadata'].includes(s))
}

/**
 * Get cache TTL based on data type and market hours
 */
export function getCacheTTL(dataType: string): number {
  const isMarketOpen = checkIfMarketOpen()
  
  switch(dataType) {
    case 'quotes':
      // Short TTL for quotes: 5s during market, 30s after hours
      return isMarketOpen ? 5 : 30
    case 'dividends':
      // Dividend data rarely changes: 24 hours
      return 86400
    case 'news':
      // News updates moderately: 5 minutes
      return 300
    case 'metadata':
      // Company info rarely changes: 24 hours
      return 86400
    default:
      return 10
  }
}

/**
 * Simple market hours check (EST/EDT)
 * Real implementation would be more sophisticated
 */
function checkIfMarketOpen(): boolean {
  const now = new Date()
  const day = now.getDay()
  
  // Market closed on weekends
  if (day === 0 || day === 6) return false
  
  // Get current hour in ET (simplified - doesn't account for DST properly)
  const etHour = now.getUTCHours() - 5 // Rough EST conversion
  
  // Market hours: 9:30 AM - 4:00 PM ET
  return etHour >= 9.5 && etHour < 16
}

/**
 * Validate symbols array
 */
export function validateSymbols(symbols: string[]): {
  valid: string[]
  invalid: string[]
} {
  const valid: string[] = []
  const invalid: string[] = []
  
  symbols.forEach(symbol => {
    // Basic validation - at least 1 character, no special chars except dash and dot
    if (symbol.length > 0 && symbol.length <= 10 && /^[A-Z0-9\-\.]+$/.test(symbol)) {
      valid.push(symbol)
    } else {
      invalid.push(symbol)
    }
  })
  
  return { valid, invalid }
}