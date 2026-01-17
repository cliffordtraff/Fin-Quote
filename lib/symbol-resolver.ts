/**
 * Symbol Resolver - Smart Stock Symbol Resolution
 *
 * This module resolves user input (company names, ticker symbols, variations)
 * to canonical stock symbols that exist in the sp500_constituents table.
 *
 * Resolution Strategy:
 * 1. Check if input is already a valid symbol (exact match)
 * 2. Check common aliases (e.g., "Apple" → "AAPL", "Google" → "GOOGL")
 * 3. Search company name in database (fuzzy match)
 * 4. Return null if no match found
 */

import { createServerClient } from './supabase/server'

// Common name-to-symbol aliases for popular companies
// These handle common variations users might type
const SYMBOL_ALIASES: Record<string, string> = {
  // Tech Giants
  apple: 'AAPL',
  microsoft: 'MSFT',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  meta: 'META',
  facebook: 'META',
  nvidia: 'NVDA',
  tesla: 'TSLA',
  netflix: 'NFLX',

  // Finance
  'jpmorgan': 'JPM',
  'jp morgan': 'JPM',
  'jpmorgan chase': 'JPM',
  'bank of america': 'BAC',
  'bofa': 'BAC',
  'wells fargo': 'WFC',
  'goldman sachs': 'GS',
  'goldman': 'GS',
  'morgan stanley': 'MS',
  'berkshire': 'BRK.B',
  'berkshire hathaway': 'BRK.B',

  // Healthcare
  'johnson & johnson': 'JNJ',
  'johnson and johnson': 'JNJ',
  'j&j': 'JNJ',
  'unitedhealth': 'UNH',
  'united health': 'UNH',
  pfizer: 'PFE',
  'eli lilly': 'LLY',
  lilly: 'LLY',
  merck: 'MRK',
  abbvie: 'ABBV',

  // Consumer
  'coca-cola': 'KO',
  'coca cola': 'KO',
  coke: 'KO',
  pepsi: 'PEP',
  pepsico: 'PEP',
  'procter & gamble': 'PG',
  'procter and gamble': 'PG',
  'p&g': 'PG',
  walmart: 'WMT',
  'wal-mart': 'WMT',
  costco: 'COST',
  'home depot': 'HD',
  'mcdonald\'s': 'MCD',
  mcdonalds: 'MCD',
  starbucks: 'SBUX',
  nike: 'NKE',
  disney: 'DIS',
  'walt disney': 'DIS',

  // Industrial/Energy
  exxon: 'XOM',
  'exxon mobil': 'XOM',
  exxonmobil: 'XOM',
  chevron: 'CVX',
  boeing: 'BA',
  caterpillar: 'CAT',
  '3m': 'MMM',
  honeywell: 'HON',
  'general electric': 'GE',
  ge: 'GE',
  'united parcel service': 'UPS',
  ups: 'UPS',
  fedex: 'FDX',

  // Tech/Software
  salesforce: 'CRM',
  adobe: 'ADBE',
  oracle: 'ORCL',
  cisco: 'CSCO',
  intel: 'INTC',
  amd: 'AMD',
  'advanced micro devices': 'AMD',
  ibm: 'IBM',
  broadcom: 'AVGO',
  qualcomm: 'QCOM',
  'texas instruments': 'TXN',
  ti: 'TXN',
  intuit: 'INTU',
  servicenow: 'NOW',
  snowflake: 'SNOW',
  palantir: 'PLTR',
  uber: 'UBER',
  airbnb: 'ABNB',

  // Telecom/Media
  'at&t': 'T',
  att: 'T',
  verizon: 'VZ',
  't-mobile': 'TMUS',
  tmobile: 'TMUS',
  comcast: 'CMCSA',

  // Retail
  target: 'TGT',
  'lowe\'s': 'LOW',
  lowes: 'LOW',
  'best buy': 'BBY',
  bestbuy: 'BBY',

  // Payments
  visa: 'V',
  mastercard: 'MA',
  'american express': 'AXP',
  amex: 'AXP',
  paypal: 'PYPL',

  // Other notable
  lockheed: 'LMT',
  'lockheed martin': 'LMT',
  raytheon: 'RTX',
  northrop: 'NOC',
  'northrop grumman': 'NOC',
}

// Cache for database lookups (symbol → company data)
let symbolCache: Map<string, { symbol: string; name: string }> | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface SymbolResolution {
  symbol: string | null
  companyName: string | null
  method: 'exact' | 'alias' | 'database' | 'fuzzy' | null
  confidence?: number
}

/**
 * Load S&P 500 constituents into cache
 */
async function loadSymbolCache(): Promise<Map<string, { symbol: string; name: string }>> {
  const now = Date.now()

  // Return cached data if still valid
  if (symbolCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return symbolCache
  }

  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('sp500_constituents')
      .select('symbol, name')
      .eq('is_active', true)

    if (error) {
      console.error('Failed to load symbol cache:', error)
      return symbolCache || new Map()
    }

    symbolCache = new Map()
    for (const row of data || []) {
      symbolCache.set(row.symbol.toUpperCase(), {
        symbol: row.symbol,
        name: row.name,
      })
    }
    cacheTimestamp = now

    return symbolCache
  } catch (err) {
    console.error('Failed to load symbol cache:', err)
    return symbolCache || new Map()
  }
}

/**
 * Resolve a user input to a stock symbol
 *
 * @param input - User input (e.g., "Apple", "AAPL", "apple inc")
 * @returns Resolution result with symbol and method used
 *
 * @example
 * resolveSymbol("Apple") // { symbol: "AAPL", companyName: "Apple Inc.", method: "alias" }
 * resolveSymbol("MSFT") // { symbol: "MSFT", companyName: "Microsoft Corporation", method: "exact" }
 */
export async function resolveSymbol(input: string): Promise<SymbolResolution> {
  if (!input || typeof input !== 'string') {
    return { symbol: null, companyName: null, method: null }
  }

  const normalized = input.trim()
  const normalizedLower = normalized.toLowerCase()
  const normalizedUpper = normalized.toUpperCase()

  // Load cache
  const cache = await loadSymbolCache()

  // 1. Check if input is already a valid symbol (exact match)
  if (cache.has(normalizedUpper)) {
    const company = cache.get(normalizedUpper)!
    return {
      symbol: company.symbol,
      companyName: company.name,
      method: 'exact',
    }
  }

  // 2. Check aliases map
  if (SYMBOL_ALIASES[normalizedLower]) {
    const symbol = SYMBOL_ALIASES[normalizedLower]
    const company = cache.get(symbol)
    return {
      symbol,
      companyName: company?.name || null,
      method: 'alias',
    }
  }

  // 3. Search company name in cache (partial match)
  for (const [, company] of cache) {
    const nameLower = company.name.toLowerCase()
    // Check if input matches start of company name or is contained in it
    if (
      nameLower.startsWith(normalizedLower) ||
      nameLower.includes(normalizedLower)
    ) {
      return {
        symbol: company.symbol,
        companyName: company.name,
        method: 'database',
      }
    }
  }

  // 4. Try fuzzy matching on company names
  const fuzzyResult = findMostSimilarCompany(normalizedLower, cache)
  if (fuzzyResult && fuzzyResult.similarity >= 0.75) {
    return {
      symbol: fuzzyResult.symbol,
      companyName: fuzzyResult.name,
      method: 'fuzzy',
      confidence: fuzzyResult.similarity,
    }
  }

  // 5. Failed to resolve
  return { symbol: null, companyName: null, method: null }
}

/**
 * Validate that a symbol exists in the database
 *
 * @param symbol - Stock symbol to validate
 * @returns True if symbol exists, false otherwise
 */
export async function isValidSymbol(symbol: string): Promise<boolean> {
  const cache = await loadSymbolCache()
  return cache.has(symbol.toUpperCase())
}

/**
 * Get company name for a symbol
 *
 * @param symbol - Stock symbol
 * @returns Company name or null
 */
export async function getCompanyName(symbol: string): Promise<string | null> {
  const cache = await loadSymbolCache()
  const company = cache.get(symbol.toUpperCase())
  return company?.name || null
}

/**
 * Get all valid symbols (for autocomplete, etc.)
 *
 * @returns Array of all valid symbols
 */
export async function getAllSymbols(): Promise<string[]> {
  const cache = await loadSymbolCache()
  return Array.from(cache.keys())
}

/**
 * Find the most similar company using Levenshtein distance
 */
function findMostSimilarCompany(
  input: string,
  cache: Map<string, { symbol: string; name: string }>
): { symbol: string; name: string; similarity: number } | null {
  let bestMatch: { symbol: string; name: string; similarity: number } | null = null

  for (const [, company] of cache) {
    const nameLower = company.name.toLowerCase()
    const similarity = stringSimilarity(input, nameLower)

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        symbol: company.symbol,
        name: company.name,
        similarity,
      }
    }
  }

  return bestMatch
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a score between 0 (completely different) and 1 (identical)
 */
function stringSimilarity(a: string, b: string): number {
  const matrix: number[][] = []

  // For very different lengths, reduce similarity
  const lengthDiff = Math.abs(a.length - b.length)
  const maxLen = Math.max(a.length, b.length)
  if (lengthDiff > maxLen * 0.5) {
    return 0.1
  }

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  const distance = matrix[b.length][a.length]

  // Convert distance to similarity score (0-1)
  return maxLen === 0 ? 1 : 1 - distance / maxLen
}

/**
 * Extract potential stock symbols or company names from a question
 * Returns array of potential identifiers found in the text
 *
 * @param question - User's question
 * @returns Array of potential symbols/company names
 */
export function extractPotentialSymbols(question: string): string[] {
  const potentials: string[] = []

  // Pattern 1: Explicit ticker symbols (1-5 uppercase letters)
  const tickerPattern = /\b([A-Z]{1,5})\b/g
  const tickerMatches = question.match(tickerPattern) || []
  potentials.push(...tickerMatches)

  // Pattern 2: Company names from aliases (case-insensitive)
  const questionLower = question.toLowerCase()
  for (const alias of Object.keys(SYMBOL_ALIASES)) {
    if (questionLower.includes(alias)) {
      potentials.push(SYMBOL_ALIASES[alias])
    }
  }

  // Pattern 3: Possessive forms ("Apple's", "Microsoft's")
  const possessivePattern = /([A-Za-z]+)(?:'s|'s)\s+(?:revenue|income|profit|earnings|stock|share|price|margin|ratio|growth|debt|assets)/gi
  let match
  while ((match = possessivePattern.exec(question)) !== null) {
    potentials.push(match[1])
  }

  // Dedupe and return
  return [...new Set(potentials)]
}
