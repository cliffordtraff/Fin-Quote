// Symbol utility functions for universal symbol support
// Reference: SYMBOL_SUPPORT_PLAN.md - Phase 2: Symbol Normalization System

export type AssetType = 'stock' | 'crypto' | 'forex' | 'futures' | 'unknown'

export interface SymbolData {
  original: string      // What user typed: "btc/usd"
  normalized: string    // Standardized: "BTCUSD"
  display: string      // For UI: "BTC/USD"
  type?: AssetType     // Detected type
  lastValid?: Date     // Last successful data fetch
}

export interface SymbolStatus {
  state: 'loading' | 'valid' | 'invalid' | 'error' | 'stale'
  message?: string
  lastAttempt?: Date
  retryCount?: number
}

// Common forex currencies
const FOREX_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'MXN', 'ZAR']

// Common crypto symbols
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'DOGE', 'SOL', 'MATIC', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'NEAR', 'FTM']

// Futures month codes
const FUTURES_MONTHS = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']

/**
 * Detect asset type from symbol pattern
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Pattern matching for asset types
 */
export function detectAssetType(symbol: string): AssetType {
  const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  
  // Check for crypto patterns
  // Ends with USD, USDT, USDC or contains major crypto symbols
  if (upper.endsWith('USD') || upper.endsWith('USDT') || upper.endsWith('USDC')) {
    const base = upper.replace(/(USD|USDT|USDC)$/, '')
    if (CRYPTO_SYMBOLS.includes(base)) {
      return 'crypto'
    }
  }
  
  // Check for crypto-to-crypto pairs
  for (const crypto of CRYPTO_SYMBOLS) {
    if (upper.startsWith(crypto) || upper.endsWith(crypto)) {
      // Check if the other part is also crypto
      const other = upper.startsWith(crypto) 
        ? upper.slice(crypto.length) 
        : upper.slice(0, -crypto.length)
      if (CRYPTO_SYMBOLS.includes(other) || other === 'USD' || other === 'USDT') {
        return 'crypto'
      }
    }
  }
  
  // Check for forex patterns (6 chars, both parts are currencies)
  if (upper.length === 6) {
    const first = upper.slice(0, 3)
    const second = upper.slice(3, 6)
    if (FOREX_CURRENCIES.includes(first) && FOREX_CURRENCIES.includes(second)) {
      return 'forex'
    }
  }
  
  // Check for futures patterns (symbol + month code + year)
  if (upper.length >= 4) {
    const lastTwo = upper.slice(-2)
    const monthCode = upper[upper.length - 3]
    if (FUTURES_MONTHS.includes(monthCode) && /^\d{2}$/.test(lastTwo)) {
      return 'futures'
    }
  }
  
  // Default to stock
  return 'stock'
}

/**
 * Normalize symbol to standard format
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 2: Handle different symbol formats
 */
export function normalizeSymbol(input: string): SymbolData {
  // Trim and uppercase
  const cleaned = input.trim().toUpperCase()
  
  // Remove common separators and spaces to create normalized version
  const normalized = cleaned.replace(/[\s\-\/\.\:]/g, '')
  
  // Detect asset type
  const type = detectAssetType(normalized)
  
  // Create display format based on type
  let display = cleaned
  if (type === 'crypto' && normalized.includes('USD')) {
    // Format as BTC/USD for crypto
    const base = normalized.replace(/(USD|USDT|USDC).*$/, '')
    const quote = normalized.slice(base.length)
    display = `${base}/${quote}`
  } else if (type === 'forex' && normalized.length === 6) {
    // Format as EUR/USD for forex
    display = `${normalized.slice(0, 3)}/${normalized.slice(3, 6)}`
  }
  
  return {
    original: input,
    normalized: normalized,
    display: display,
    type: type,
    lastValid: undefined
  }
}

/**
 * Get appropriate price range for asset type
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Generate appropriate fallback data
 */
export function getPriceRangeForType(type: AssetType): { min: number, max: number, decimals: number } {
  switch (type) {
    case 'crypto':
      return { min: 0.00001, max: 100000, decimals: 2 }
    case 'forex':
      return { min: 0.5, max: 150, decimals: 4 }
    case 'futures':
      return { min: 10, max: 10000, decimals: 2 }
    case 'stock':
    default:
      return { min: 1, max: 5000, decimals: 2 }
  }
}

/**
 * Get appropriate volatility for asset type
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Different volatility per type
 */
export function getVolatilityForType(type: AssetType): number {
  switch (type) {
    case 'crypto':
      return 0.05  // 5% daily volatility
    case 'forex':
      return 0.005 // 0.5% daily volatility
    case 'futures':
      return 0.02  // 2% daily volatility
    case 'stock':
    default:
      return 0.015 // 1.5% daily volatility
  }
}

/**
 * Generate a realistic base price for unknown symbols
 */
export function generateBasePrice(symbol: string, type: AssetType): number {
  const range = getPriceRangeForType(type)
  
  // Use symbol hash to generate consistent price
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  
  // Map hash to price range
  const normalized = Math.abs(hash) / 2147483647 // Normalize to 0-1
  
  // Special handling for known patterns
  if (symbol.includes('BTC')) {
    return 45000 + normalized * 30000 // BTC: $45k-75k range
  }
  if (symbol.includes('ETH')) {
    return 2500 + normalized * 2000 // ETH: $2.5k-4.5k range
  }
  if (type === 'forex') {
    // Most forex pairs are between 0.5-2.0, except JPY pairs
    if (symbol.includes('JPY')) {
      return 100 + normalized * 50 // JPY pairs: 100-150
    }
    return 0.8 + normalized * 0.6 // Others: 0.8-1.4
  }
  
  // Generate price within range, biased toward middle
  const logRange = Math.log(range.max) - Math.log(range.min)
  const logPrice = Math.log(range.min) + logRange * (0.2 + normalized * 0.6)
  return Math.exp(logPrice)
}