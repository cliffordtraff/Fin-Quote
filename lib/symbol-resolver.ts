/**
 * Symbol Resolver - Smart Stock Symbol Resolution
 *
 * This module resolves user input (company names, ticker symbols, variations)
 * to canonical stock symbols. Supports all US stocks via the us_stocks table,
 * with fallback to sp500_constituents for backwards compatibility.
 *
 * Resolution Strategy:
 * 1. Check if input is already a valid symbol (exact match)
 * 2. Check common aliases (e.g., "Apple" → "AAPL", "Google" → "GOOGL")
 * 3. Search company name in database (fuzzy match)
 * 4. Return null if no match found
 */

import {
  getMarketSymbolLookupAliases,
  isValidMarketSymbol,
  isValidStockPageSymbol,
  normalizeMarketSymbol,
} from './market-symbol'
import { safeErrorMessage } from './safe-logging'
import {
  leaseSymbolValidityLoad,
  readSymbolValidityCache,
  SymbolValidityLoadTimeoutError,
  type CacheableSymbolValidity,
} from './symbol-validity-cache'
import { createPublicClient } from './supabase/public'
import {
  MAX_STOCK_SEARCH_RESULTS,
  type StockSearchOutcome,
} from './stock-search-contract'

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
export type SymbolValidity = 'valid' | 'not_found' | 'unavailable'

class SymbolValidationUnavailableError extends Error {
  constructor(symbol: string, cause: unknown) {
    super(`Symbol validation is unavailable for ${symbol}`, { cause })
    this.name = 'SymbolValidationUnavailableError'
  }
}

export interface SymbolResolution {
  symbol: string | null
  companyName: string | null
  method: 'exact' | 'alias' | 'database' | 'fuzzy' | null
  confidence?: number
}

/**
 * Load stock symbols into cache
 * Tries us_stocks first (all US stocks), falls back to sp500_constituents
 */
async function loadSymbolCache(): Promise<Map<string, { symbol: string; name: string }>> {
  const now = Date.now()

  // Return cached data if still valid
  if (symbolCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return symbolCache
  }

  try {
    const supabase = createPublicClient()

    // Try us_stocks table first (has all US stocks)
    // Note: Supabase default limit is 1000, we need all ~10k stocks
    const { data: primaryData, error } = await supabase
      .from('us_stocks')
      .select('symbol, name')
      .eq('is_active', true)
      .limit(15000)
    let data = primaryData

    // Fallback to sp500_constituents if us_stocks doesn't exist or is empty
    if (error || !data || data.length === 0) {
      const fallback = await supabase
        .from('sp500_constituents')
        .select('symbol, name')
        .eq('is_active', true)

      if (fallback.error) {
        console.error('Failed to load symbol cache:', fallback.error)
        return symbolCache || new Map()
      }
      data = fallback.data
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

function symbolValidationUnavailable(
  symbol: string,
  cause: unknown,
): SymbolValidationUnavailableError {
  console.error(
    `[symbol-resolver] Validation unavailable for ${symbol}:`,
    safeErrorMessage(cause),
  )
  return new SymbolValidationUnavailableError(symbol, cause)
}

async function loadSymbolValidity(
  normalizedSymbol: string,
  signal: AbortSignal,
): Promise<CacheableSymbolValidity> {
  signal.throwIfAborted()
  const lookupSymbols = getMarketSymbolLookupAliases(normalizedSymbol)
  let supabase: ReturnType<typeof createPublicClient>
  try {
    supabase = createPublicClient()
  } catch (error) {
    throw symbolValidationUnavailable(normalizedSymbol, error)
  }

  let primaryError: unknown = null
  try {
    // maybeSingle distinguishes an authoritative zero-row result from a
    // transport/query failure. A failure cannot safely become a public 404.
    const { data, error } = await supabase
      .from('us_stocks')
      .select('symbol')
      .eq('is_active', true)
      .in('symbol', lookupSymbols)
      .limit(1)
      .abortSignal(signal)
      .maybeSingle()

    if (!error && data) {
      return 'valid'
    }
    primaryError = error
  } catch (error) {
    primaryError = error
  }
  signal.throwIfAborted()

  let fallbackError: unknown = null
  try {
    const { data, error } = await supabase
      .from('sp500_constituents')
      .select('symbol')
      .eq('is_active', true)
      .in('symbol', lookupSymbols)
      .limit(1)
      .abortSignal(signal)
      .maybeSingle()

    if (!error && data) {
      return 'valid'
    }
    fallbackError = error
  } catch (error) {
    fallbackError = error
  }
  signal.throwIfAborted()

  if (primaryError || fallbackError) {
    throw symbolValidationUnavailable(
      normalizedSymbol,
      fallbackError || primaryError,
    )
  }

  return 'not_found'
}

/**
 * Classify a public stock symbol without turning infrastructure failure into
 * an authoritative absence. Only valid/not-found results enter the TTL cache;
 * unavailable results retry on the next call.
 */
export async function getSymbolValidity(symbol: string): Promise<SymbolValidity> {
  const normalizedSymbol = normalizeMarketSymbol(symbol)
  if (!isValidMarketSymbol(normalizedSymbol)) {
    return 'not_found'
  }

  const cached = readSymbolValidityCache(normalizedSymbol, Date.now())
  if (cached) return cached

  const lease = leaseSymbolValidityLoad(normalizedSymbol, (signal) =>
    loadSymbolValidity(normalizedSymbol, signal)
  )
  if (lease.status === 'capacity') return 'unavailable'

  try {
    return await lease.promise
  } catch (error) {
    if (
      lease.status === 'started' &&
      !(error instanceof SymbolValidationUnavailableError) &&
      !(error instanceof SymbolValidityLoadTimeoutError)
    ) {
      console.error(
        `[symbol-resolver] Unexpected validation failure for ${normalizedSymbol}:`,
        safeErrorMessage(error),
      )
    }
    return 'unavailable'
  }
}

/**
 * Compatibility boolean for non-page callers. Public pages should use the
 * tri-state API so an unavailable registry is not rendered as a 404.
 */
export async function isValidSymbol(symbol: string): Promise<boolean> {
  return (await getSymbolValidity(symbol)) === 'valid'
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
 * Search for stocks by symbol or company name
 * Used for the stock search dropdown
 *
 * Queries database directly (not cache) to support 10k+ stocks
 *
 * @param query - Search query (symbol or company name)
 * @returns Array of matching stocks, sorted by relevance
 *
 * @example
 * searchSymbols("AAPL") // [{ symbol: "AAPL", name: "Apple Inc." }]
 * searchSymbols("Apple") // [{ symbol: "AAPL", name: "Apple Inc." }, ...]
 */
export const MAX_STOCK_SEARCH_QUERY_LENGTH = 64
export { MAX_STOCK_SEARCH_RESULTS } from './stock-search-contract'

const STOCK_SEARCH_QUERY_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N} .&'\/-]*$/u
const STOCK_SEARCH_DATABASE_LIMIT = 25

export class StockSearchInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StockSearchInputError'
  }
}

export class StockSearchUnavailableError extends Error {
  constructor() {
    super('Search unavailable')
    this.name = 'StockSearchUnavailableError'
  }
}

class StockSearchRuntimeDataError extends StockSearchUnavailableError {
  constructor() {
    super()
    this.name = 'StockSearchRuntimeDataError'
  }
}

interface StockSearchRow {
  symbol: string
  name: string
  marketCap: number | null
}

type StockSearchTable = 'us_stocks' | 'sp500_constituents'

/**
 * Keep PostgREST filter syntax out of the public search boundary. Whitespace is
 * canonicalized so equivalent requests share a cache key; SQL wildcard and
 * filter-control characters are deliberately not part of the accepted grammar.
 */
export function normalizeStockSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new StockSearchInputError(
      'Search contains unsupported characters.',
    )
  }
  const query = value.trim().replace(/ +/g, ' ')
  if (!query) return ''
  if (query.length > MAX_STOCK_SEARCH_QUERY_LENGTH) {
    throw new StockSearchInputError(
      `Search queries must be ${MAX_STOCK_SEARCH_QUERY_LENGTH} characters or fewer.`,
    )
  }
  if (!STOCK_SEARCH_QUERY_PATTERN.test(query)) {
    throw new StockSearchInputError(
      'Search contains unsupported characters.',
    )
  }
  return query
}

function normalizeStockSearchRows(
  value: unknown,
  table: StockSearchTable,
): StockSearchRow[] {
  if (!Array.isArray(value)) throw new StockSearchRuntimeDataError()

  const rows: StockSearchRow[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new StockSearchRuntimeDataError()
    }
    const row = entry as Record<string, unknown>
    if (typeof row.symbol !== 'string' || typeof row.name !== 'string') {
      throw new StockSearchRuntimeDataError()
    }
    const rawSymbol = row.symbol.trim()
    const symbol = normalizeMarketSymbol(rawSymbol)
    const name = row.name.trim()
    if (!isValidStockPageSymbol(symbol) || !name || name.length > 240) {
      throw new StockSearchRuntimeDataError()
    }
    const rawMarketCap = row.market_cap
    if (
      table === 'us_stocks' &&
      rawMarketCap != null &&
      (typeof rawMarketCap !== 'number' || !Number.isFinite(rawMarketCap))
    ) {
      throw new StockSearchRuntimeDataError()
    }
    rows.push({
      symbol,
      name,
      marketCap:
        typeof rawMarketCap === 'number' && Number.isFinite(rawMarketCap)
          ? rawMarketCap
          : null,
    })
  }
  return rows
}

function symbolSearchPrefixes(query: string): string[] {
  const upperQuery = query.toUpperCase()
  if (!/^[A-Z][A-Z0-9]{0,9}[.-][A-Z0-9]{0,4}$/.test(upperQuery)) {
    return [upperQuery]
  }

  const canonical = normalizeMarketSymbol(upperQuery)
  const aliases = getMarketSymbolLookupAliases(canonical)
  if (canonical.endsWith('.')) aliases.push(canonical.replace(/\.$/, '-'))
  return [...new Set(aliases)]
}

async function queryStockSearchTable(
  table: StockSearchTable,
  query: string,
  signal?: AbortSignal,
): Promise<StockSearchRow[]> {
  signal?.throwIfAborted()
  let supabase: ReturnType<typeof createPublicClient>
  try {
    supabase = createPublicClient()
  } catch {
    signal?.throwIfAborted()
    throw new StockSearchUnavailableError()
  }
  const namePattern = query.length === 2 ? `${query}%` : `%${query}%`

  const buildSymbolQuery = (prefix: string) => {
    let request = table === 'us_stocks'
      ? supabase
          .from('us_stocks')
          .select('symbol, name, market_cap')
          .eq('is_active', true)
          .ilike('symbol', `${prefix}%`)
          .order('market_cap', { ascending: false, nullsFirst: false })
          .limit(STOCK_SEARCH_DATABASE_LIMIT)
      : supabase
          .from('sp500_constituents')
          .select('symbol, name')
          .eq('is_active', true)
          .ilike('symbol', `${prefix}%`)
          .limit(STOCK_SEARCH_DATABASE_LIMIT)
    if (signal) request = request.abortSignal(signal)
    return request
  }

  const requests = symbolSearchPrefixes(query).map(buildSymbolQuery)
  if (query.length >= 2) {
    let nameRequest = table === 'us_stocks'
      ? supabase
          .from('us_stocks')
          .select('symbol, name, market_cap')
          .eq('is_active', true)
          .ilike('name', namePattern)
          .order('market_cap', { ascending: false, nullsFirst: false })
          .limit(STOCK_SEARCH_DATABASE_LIMIT)
      : supabase
          .from('sp500_constituents')
          .select('symbol, name')
          .eq('is_active', true)
          .ilike('name', namePattern)
          .limit(STOCK_SEARCH_DATABASE_LIMIT)
    if (signal) nameRequest = nameRequest.abortSignal(signal)
    requests.push(nameRequest)
  }

  let responses: Awaited<(typeof requests)[number]>[]
  try {
    responses = await Promise.all(requests)
  } catch {
    signal?.throwIfAborted()
    throw new StockSearchUnavailableError()
  }
  signal?.throwIfAborted()
  const rows: StockSearchRow[] = []
  for (const response of responses) {
    if (
      !response ||
      typeof response !== 'object'
    ) {
      throw new StockSearchRuntimeDataError()
    }
    if (response.error) throw new StockSearchUnavailableError()
    if (!Array.isArray(response.data)) throw new StockSearchRuntimeDataError()
    rows.push(...normalizeStockSearchRows(response.data, table))
  }
  return rows
}

function rankStockSearchRows(
  rows: StockSearchRow[],
  query: string,
): Array<{ symbol: string; name: string }> {
  const upperQuery = normalizeMarketSymbol(query.toUpperCase())
  const lowerQuery = query.toLowerCase()
  const unique = new Map<string, StockSearchRow>()
  for (const row of rows) {
    const current = unique.get(row.symbol)
    if (
      !current ||
      (row.marketCap ?? Number.NEGATIVE_INFINITY) >
        (current.marketCap ?? Number.NEGATIVE_INFINITY)
    ) {
      unique.set(row.symbol, row)
    }
  }

  const score = (row: StockSearchRow): number => {
    if (row.symbol === upperQuery) return 0
    if (row.symbol.startsWith(upperQuery)) return 1
    if (row.name.toLowerCase().startsWith(lowerQuery)) return 2
    return 3
  }

  return [...unique.values()]
    .sort((left, right) => {
      const scoreDifference = score(left) - score(right)
      if (scoreDifference !== 0) return scoreDifference
      const marketCapDifference =
        (right.marketCap ?? Number.NEGATIVE_INFINITY) -
        (left.marketCap ?? Number.NEGATIVE_INFINITY)
      if (marketCapDifference !== 0) return marketCapDifference
      return left.symbol.localeCompare(right.symbol)
    })
    .slice(0, MAX_STOCK_SEARCH_RESULTS)
    .map(({ symbol, name }) => ({ symbol, name }))
}

/**
 * Search the full US registry with a bounded S&P 500 compatibility fallback.
 * Infrastructure failures stay distinct from an authoritative empty result.
 */
export async function searchSymbols(
  value: string,
  signal?: AbortSignal,
): Promise<StockSearchOutcome> {
  const query = normalizeStockSearchQuery(value)
  if (!query) return { results: [], source: 'primary' }

  try {
    const primary = await queryStockSearchTable('us_stocks', query, signal)
    return {
      results: rankStockSearchRows(primary, query),
      source: 'primary',
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof StockSearchRuntimeDataError) throw error
    if (!(error instanceof StockSearchUnavailableError)) throw error
  }

  try {
    const fallback = await queryStockSearchTable(
      'sp500_constituents',
      query,
      signal,
    )
    const results = rankStockSearchRows(fallback, query)
    if (results.length === 0) throw new StockSearchUnavailableError()
    return { results, source: 'fallback' }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof StockSearchInputError) throw error
    throw new StockSearchUnavailableError()
  }
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
