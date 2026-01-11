'use server'

export interface ExtendedHoursStock {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number // Regular session volume
  extendedVolume: number // Pre-market or after-hours volume
  marketCap: number
  floatShares: number | null // Float shares (null if not available)
}

interface ExtendedHoursSnapshot {
  timestamp: number
  session: 'premarket' | 'afterhours'
  stocks: ExtendedHoursStock[]
}

// Shared cache (in-memory) with 2-minute TTL for full market scan
let cachedSnapshot: ExtendedHoursSnapshot | null = null
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes in milliseconds

// Float data cache (longer TTL since float doesn't change often)
let cachedFloatData: Map<string, number> | null = null
let floatCacheTimestamp: number = 0
const FLOAT_CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Filters to match Finviz-quality results
const MIN_PRICE = 1.00 // Minimum stock price
const MIN_EXTENDED_VOLUME = 10000 // Minimum pre-market/after-hours volume (10K shares)

// Suffixes that indicate non-common stock securities
const EXCLUDED_SUFFIXES = ['W', 'U', 'R', 'WS'] // Warrants, Units, Rights

/**
 * Fetch all stocks from NASDAQ and NYSE using bulk endpoints
 * Returns ~18,000 stocks with previousClose for filtering
 */
async function fetchBulkQuotes(): Promise<any[]> {
  const FMP_API_KEY = process.env.FMP_API_KEY
  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY environment variable is not set')
  }

  console.log('Fetching bulk quotes from NASDAQ and NYSE...')

  const [nasdaqResp, nyseResp] = await Promise.all([
    fetch(`https://financialmodelingprep.com/api/v3/quotes/nasdaq?apikey=${FMP_API_KEY}`, {
      next: { revalidate: 60 }, // 1 minute cache for bulk data
    }),
    fetch(`https://financialmodelingprep.com/api/v3/quotes/nyse?apikey=${FMP_API_KEY}`, {
      next: { revalidate: 60 },
    }),
  ])

  const [nasdaqData, nyseData] = await Promise.all([
    nasdaqResp.json(),
    nyseResp.json(),
  ])

  const allStocks = [
    ...(Array.isArray(nasdaqData) ? nasdaqData : []),
    ...(Array.isArray(nyseData) ? nyseData : []),
  ]

  console.log(`Bulk quotes: ${nasdaqData?.length || 0} NASDAQ + ${nyseData?.length || 0} NYSE = ${allStocks.length} total`)
  return allStocks
}

/**
 * Fetch float data for all stocks
 * Returns a Map of symbol -> floatShares
 * Cached for 1 hour since float data doesn't change frequently
 */
async function fetchFloatData(): Promise<Map<string, number>> {
  // Check cache
  if (cachedFloatData && Date.now() - floatCacheTimestamp < FLOAT_CACHE_TTL) {
    console.log('Using cached float data')
    return cachedFloatData
  }

  const FMP_API_KEY = process.env.FMP_API_KEY
  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY environment variable is not set')
  }

  console.log('Fetching float data for all stocks...')

  try {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v4/shares_float/all?apikey=${FMP_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    )
    const data = await response.json()

    const floatMap = new Map<string, number>()
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.symbol && item.floatShares > 0) {
          floatMap.set(item.symbol, item.floatShares)
        }
      })
    }

    console.log(`Float data fetched for ${floatMap.size} stocks`)

    // Update cache
    cachedFloatData = floatMap
    floatCacheTimestamp = Date.now()

    return floatMap
  } catch (error) {
    console.error('Failed to fetch float data:', error)
    return cachedFloatData || new Map()
  }
}

/**
 * Fetch extended hours prices for given symbols
 * Uses batch-aftermarket-trade endpoint which returns real-time extended session prices
 * FMP supports up to 1000 symbols per request
 *
 * Returns: Map of symbol -> { price, volume (extended hours volume) }
 */
async function fetchExtendedHoursPrices(symbols: string[]): Promise<Map<string, { price: number; volume: number }>> {
  const FMP_API_KEY = process.env.FMP_API_KEY
  if (!FMP_API_KEY) {
    throw new Error('FMP_API_KEY environment variable is not set')
  }

  const BATCH_SIZE = 1000 // FMP supports up to 1000 symbols per request
  const priceMap = new Map<string, { price: number; volume: number }>()

  // Split symbols into batches
  const batches: string[][] = []
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE))
  }

  console.log(`Fetching extended hours prices for ${symbols.length} stocks in ${batches.length} batches...`)

  // Fetch batches in parallel (limit to 10 concurrent for faster scanning)
  const CONCURRENT_LIMIT = 10
  for (let i = 0; i < batches.length; i += CONCURRENT_LIMIT) {
    const batchGroup = batches.slice(i, i + CONCURRENT_LIMIT)

    const results = await Promise.all(
      batchGroup.map(async (batch) => {
        const symbolsParam = batch.join(',')
        const url = `https://financialmodelingprep.com/stable/batch-aftermarket-trade?symbols=${symbolsParam}&apikey=${FMP_API_KEY}`

        try {
          const response = await fetch(url, {
            next: { revalidate: 30 }, // 30 second cache for real-time data
          })
          const data = await response.json()
          return Array.isArray(data) ? data : []
        } catch (error) {
          console.error('Extended hours batch failed:', error)
          return []
        }
      })
    )

    // Collect results into map
    // The API returns 'size' or 'tradeSize' for individual trade size, and 'volume' for total volume
    results.flat().forEach((item: any) => {
      if (item.symbol && item.price) {
        // Use volume if available, otherwise use size/tradeSize as fallback
        const extVolume = item.volume || item.size || item.tradeSize || 0
        priceMap.set(item.symbol, {
          price: item.price,
          volume: extVolume,
        })
      }
    })
  }

  console.log(`Extended hours prices fetched for ${priceMap.size} stocks`)
  return priceMap
}

/**
 * Check if a symbol represents a common stock (not warrant, unit, right, etc.)
 */
function isCommonStock(symbol: string): boolean {
  if (!symbol) return false

  // Skip class shares like BRK.A, BRK.B
  if (symbol.includes('.')) return false

  // Check for excluded suffixes (warrants, units, rights)
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      return false
    }
  }

  // Skip symbols that are too long (likely warrants/units with weird suffixes)
  if (symbol.length > 5) return false

  return true
}

/**
 * Filter stocks to get quality candidates
 * Excludes ultra-penny stocks, warrants, units, rights, and invalid data
 */
function filterStocks(quotes: any[]): any[] {
  return quotes.filter(q =>
    q.price >= MIN_PRICE &&
    q.previousClose > 0 &&
    q.symbol &&
    q.name &&
    isCommonStock(q.symbol)
  )
}

/**
 * Get or create extended hours snapshot
 * This is the SHARED cache that both gainers and losers read from
 *
 * Full market coverage approach:
 * 1. Fetch all stocks from NASDAQ + NYSE bulk endpoints (~18,000 stocks, 2 API calls)
 * 2. Filter with minimal criteria (price > $0.50) → ~15,000 stocks
 * 3. Fetch extended hours prices (~15 batch API calls with 1000 per batch)
 * 4. Calculate % change from previousClose using extended hours prices
 * 5. Only stocks with actual extended hours trading activity are included
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

  console.log(`Fetching fresh ${session} snapshot with full market coverage...`)

  // Step 1: Fetch all stocks from NASDAQ and NYSE, and float data in parallel
  const [allQuotes, floatData] = await Promise.all([
    fetchBulkQuotes(),
    fetchFloatData(),
  ])

  // Step 2: Filter with minimal criteria to allow small caps through
  const filteredStocks = filterStocks(allQuotes)
  console.log(`Filtered to ${filteredStocks.length} stocks (price >= $${MIN_PRICE})`)

  // Step 3: Fetch extended hours prices for all filtered stocks
  const symbols = filteredStocks.map(s => s.symbol)
  const extendedPrices = await fetchExtendedHoursPrices(symbols)

  // Step 4: Calculate % change using extended hours prices and add float data
  // Also filter by minimum extended hours volume to exclude low-activity stocks
  const stocks: ExtendedHoursStock[] = filteredStocks
    .filter(q => {
      const extData = extendedPrices.get(q.symbol)
      if (!extData) return false
      // Require minimum extended hours volume
      return extData.volume >= MIN_EXTENDED_VOLUME
    })
    .map(q => {
      const extData = extendedPrices.get(q.symbol)!
      const extPrice = extData.price
      const prevClose = q.previousClose
      const change = extPrice - prevClose
      const changePercent = (change / prevClose) * 100

      return {
        symbol: q.symbol,
        name: q.name,
        price: extPrice, // Use extended hours price
        change: change,
        changesPercentage: changePercent,
        volume: q.volume || 0, // Regular session volume
        extendedVolume: extData.volume, // Pre-market or after-hours volume
        marketCap: q.marketCap,
        floatShares: floatData.get(q.symbol) || null,
      }
    })

  console.log(`Built snapshot with ${stocks.length} stocks having extended hours data`)

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

// Maximum realistic daily percentage change (filter out bad data)
// Even extreme moves like GME/AMC rarely exceeded 200% in a single session
const MAX_REALISTIC_PERCENT_CHANGE = 500

/**
 * Derive top 20 gainers from shared snapshot
 */
export async function deriveGainers(
  session: 'premarket' | 'afterhours'
): Promise<ExtendedHoursStock[]> {
  const snapshot = await getExtendedHoursSnapshot(session)

  // Sort by percent change (descending), take top 20 positive movers
  // Filter out unrealistic percentage changes (likely bad data)
  const gainers = snapshot.stocks
    .filter(s => s.changesPercentage > 0 && s.changesPercentage < MAX_REALISTIC_PERCENT_CHANGE)
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
  // Filter out unrealistic percentage changes (likely bad data)
  const losers = snapshot.stocks
    .filter(s => s.changesPercentage < 0 && s.changesPercentage > -MAX_REALISTIC_PERCENT_CHANGE)
    .sort((a, b) => a.changesPercentage - b.changesPercentage)
    .slice(0, 20)

  return losers
}

/**
 * Clear the cache (useful for testing)
 */
export async function clearExtendedHoursCache(): Promise<void> {
  cachedSnapshot = null
  console.log('Extended hours cache cleared')
}
