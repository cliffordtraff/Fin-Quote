'use server'

import fs from 'fs'
import path from 'path'

export interface ExtendedHoursStock {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
  marketCap: number
}

interface ExtendedHoursSnapshot {
  timestamp: number
  session: 'premarket' | 'afterhours'
  stocks: ExtendedHoursStock[]
}

// Shared cache (in-memory) with 10-minute TTL
let cachedSnapshot: ExtendedHoursSnapshot | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes in milliseconds

/**
 * Load ticker universe from data/us_tickers.txt
 * Returns array of ticker symbols
 */
function loadTickerUniverse(): string[] {
  const filePath = path.join(process.cwd(), 'data', 'us_tickers.txt')

  if (!fs.existsSync(filePath)) {
    throw new Error(
      'Ticker universe file not found. Run: npx tsx scripts/filter-ticker-universe.ts'
    )
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const tickers = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  return tickers
}

/**
 * Fetch quotes in batches of 200 symbols
 * Returns combined array of all quotes
 */
async function batchQuoteFetch(symbols: string[]): Promise<any[]> {
  const FMP_API_KEY = process.env.FMP_API_KEY
  const BATCH_SIZE = 200

  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY environment variable is not set')
  }

  const batches: string[][] = []
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE))
  }

  console.log(`Fetching quotes for ${symbols.length} stocks in ${batches.length} batches...`)

  const allQuotes: any[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const symbolsParam = batch.join(',')
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbolsParam}?apikey=${FMP_API_KEY}`

    try {
      const response = await fetch(url, {
        next: { revalidate: CACHE_TTL / 1000 }, // ISR caching
      })
      const data = await response.json()

      if (Array.isArray(data)) {
        allQuotes.push(...data)
      }

      console.log(`  Batch ${i + 1}/${batches.length}: fetched ${data.length} quotes`)
    } catch (error) {
      console.error(`  Batch ${i + 1}/${batches.length}: failed`, error)
    }
  }

  console.log(`Total quotes fetched: ${allQuotes.length}`)
  return allQuotes
}

/**
 * Filter stocks by liquidity (price > $5 AND marketCap > $1B)
 * Extract extended hours data based on session
 */
function filterByLiquidity(
  quotes: any[],
  session: 'premarket' | 'afterhours'
): ExtendedHoursStock[] {
  const MIN_PRICE = 5
  const MIN_MARKET_CAP = 1_000_000_000 // $1B

  const changeField = session === 'premarket' ? 'preMarketChange' : 'afterMarketChange'
  const percentField = session === 'premarket' ? 'preMarketChangePercentage' : 'afterMarketChangePercentage'

  const filtered = quotes
    .filter(q => {
      // Must have extended hours data
      if (q[changeField] === null || q[changeField] === undefined) return false
      if (q[percentField] === null || q[percentField] === undefined) return false

      // Liquidity filters
      if (q.price < MIN_PRICE) return false
      if (q.marketCap < MIN_MARKET_CAP) return false

      return true
    })
    .map(q => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      change: q[changeField],
      changesPercentage: q[percentField],
      volume: q.volume || 0,
      marketCap: q.marketCap,
    }))

  return filtered
}

/**
 * Get or create extended hours snapshot
 * This is the SHARED cache that both gainers and losers read from
 */
export async function getExtendedHoursSnapshot(
  session: 'premarket' | 'afterhours'
): Promise<ExtendedHoursSnapshot> {
  // Check if cache is still valid
  if (cachedSnapshot && cachedSnapshot.session === session) {
    const age = Date.now() - cachedSnapshot.timestamp
    if (age < CACHE_TTL) {
      console.log(`Using cached ${session} snapshot (age: ${Math.round(age / 1000)}s)`)
      return cachedSnapshot
    }
  }

  console.log(`Fetching fresh ${session} snapshot...`)

  // Load ticker universe
  const tickers = loadTickerUniverse()
  console.log(`Loaded ${tickers.length} tickers from universe`)

  // Fetch batch quotes (2 API calls for ~300 stocks)
  const quotes = await batchQuoteFetch(tickers)

  // Filter by liquidity and extract extended hours data
  const stocks = filterByLiquidity(quotes, session)
  console.log(`Filtered to ${stocks.length} liquid stocks with ${session} data`)

  // Create new snapshot
  const snapshot: ExtendedHoursSnapshot = {
    timestamp: Date.now(),
    session,
    stocks,
  }

  // Update cache
  cachedSnapshot = snapshot

  return snapshot
}

/**
 * Derive top 20 gainers from shared snapshot
 */
export async function deriveGainers(
  session: 'premarket' | 'afterhours'
): Promise<ExtendedHoursStock[]> {
  const snapshot = await getExtendedHoursSnapshot(session)

  // Sort by percent change (descending), take top 20 positive movers
  const gainers = snapshot.stocks
    .filter(s => s.changesPercentage > 0)
    .sort((a, b) => b.changesPercentage - a.changesPercentage)
    .slice(0, 20)

  return gainers
}

/**
 * Derive top 20 losers from shared snapshot
 */
export async function deriveLosers(
  session: 'premarket' | 'afterhours'
): Promise<ExtendedHoursStock[]> {
  const snapshot = await getExtendedHoursSnapshot(session)

  // Sort by percent change (ascending), take top 20 negative movers
  const losers = snapshot.stocks
    .filter(s => s.changesPercentage < 0)
    .sort((a, b) => a.changesPercentage - b.changesPercentage)
    .slice(0, 20)

  return losers
}

/**
 * Clear the cache (useful for testing)
 */
export function clearExtendedHoursCache(): void {
  cachedSnapshot = null
  console.log('Extended hours cache cleared')
}
