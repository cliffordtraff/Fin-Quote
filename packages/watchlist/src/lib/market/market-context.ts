/**
 * Market Context Service
 *
 * Provides market-wide context for attribution:
 * - Benchmark returns (SPY, QQQ)
 * - Market session timing
 * - Volatility estimates
 *
 * Caches benchmark data in Firestore to minimize API calls.
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@watchlist/lib/firebase/config'

export interface BenchmarkReturns {
  SPY: {
    return: number      // Daily return as decimal (e.g., 0.0125 = +1.25%)
    close: number       // Closing price
    open: number        // Opening price
    date: string        // ISO date string
  }
  QQQ: {
    return: number
    close: number
    open: number
    date: string
  }
  fetchedAt: Date
  source: 'live' | 'cached' | 'fallback'
}

interface CachedBenchmark {
  SPY: {
    return: number
    close: number
    open: number
    date: string
  }
  QQQ: {
    return: number
    close: number
    open: number
    date: string
  }
  fetchedAt: Timestamp
  expiresAt: Timestamp
}

/**
 * Get benchmark returns for a specific date
 * Uses Firestore cache with 24h TTL
 */
export async function getBenchmarkReturns(date: Date = new Date()): Promise<BenchmarkReturns | null> {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD

  try {
    // Try cache first
    const cached = await getCachedBenchmarks(dateStr)
    if (cached) {
      return cached
    }

    // Fetch live data
    const live = await fetchLiveBenchmarks(date)
    if (live) {
      // Cache for 24 hours
      await cacheBenchmarks(dateStr, live)
      return live
    }

    // Try stale cache as fallback
    const stale = await getCachedBenchmarks(dateStr, true)
    if (stale) {
      console.warn('Using stale benchmark cache')
      return { ...stale, source: 'fallback' }
    }

    return null
  } catch (error) {
    console.error('Error fetching benchmark returns:', error)
    // Try stale cache on error
    const stale = await getCachedBenchmarks(dateStr, true)
    if (stale) {
      console.warn('Using stale benchmark cache due to error')
      return { ...stale, source: 'fallback' }
    }
    return null
  }
}

/**
 * Fetch live benchmark data from FMP API
 */
async function fetchLiveBenchmarks(date: Date): Promise<BenchmarkReturns | null> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.warn('FMP_API_KEY not set, cannot fetch benchmark data')
    return null
  }

  try {
    const dateStr = date.toISOString().split('T')[0]

    // Fetch SPY and QQQ historical data
    const [spyResponse, qqqResponse] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/SPY?from=${dateStr}&to=${dateStr}&apikey=${apiKey}`),
      fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/QQQ?from=${dateStr}&to=${dateStr}&apikey=${apiKey}`)
    ])

    if (!spyResponse.ok || !qqqResponse.ok) {
      console.error('FMP API error:', spyResponse.status, qqqResponse.status)
      return null
    }

    const spyData = await spyResponse.json()
    const qqqData = await qqqResponse.json()

    // Extract daily data
    const spyBar = spyData.historical?.[0]
    const qqqBar = qqqData.historical?.[0]

    if (!spyBar || !qqqBar) {
      console.warn('No benchmark data available for date:', dateStr)
      return null
    }

    // Calculate returns
    const spyReturn = (spyBar.close - spyBar.open) / spyBar.open
    const qqqReturn = (qqqBar.close - qqqBar.open) / qqqBar.open

    return {
      SPY: {
        return: spyReturn,
        close: spyBar.close,
        open: spyBar.open,
        date: spyBar.date
      },
      QQQ: {
        return: qqqReturn,
        close: qqqBar.close,
        open: qqqBar.open,
        date: qqqBar.date
      },
      fetchedAt: new Date(),
      source: 'live'
    }
  } catch (error) {
    console.error('Error fetching live benchmarks:', error)
    return null
  }
}

/**
 * Get cached benchmark data from Firestore
 */
async function getCachedBenchmarks(dateStr: string, allowStale: boolean = false): Promise<BenchmarkReturns | null> {
  try {
    const cacheRef = doc(db, 'marketContext', `benchmarks_${dateStr}`)
    const cacheSnap = await getDoc(cacheRef)

    if (!cacheSnap.exists()) {
      return null
    }

    const cached = cacheSnap.data() as CachedBenchmark

    // Check expiry unless allowing stale
    if (!allowStale) {
      const now = Timestamp.now()
      if (cached.expiresAt.toMillis() < now.toMillis()) {
        return null // Expired
      }
    }

    return {
      SPY: cached.SPY,
      QQQ: cached.QQQ,
      fetchedAt: cached.fetchedAt.toDate(),
      source: 'cached'
    }
  } catch (error) {
    console.error('Error reading benchmark cache:', error)
    return null
  }
}

/**
 * Cache benchmark data in Firestore
 */
async function cacheBenchmarks(dateStr: string, benchmarks: BenchmarkReturns): Promise<void> {
  try {
    const cacheRef = doc(db, 'marketContext', `benchmarks_${dateStr}`)
    const now = Timestamp.now()
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000) // 24h TTL

    const cached: CachedBenchmark = {
      SPY: benchmarks.SPY,
      QQQ: benchmarks.QQQ,
      fetchedAt: Timestamp.fromDate(benchmarks.fetchedAt),
      expiresAt
    }

    await setDoc(cacheRef, cached)
  } catch (error) {
    console.error('Error caching benchmarks:', error)
    // Non-fatal, continue without cache
  }
}

/**
 * Get market session date for a given timestamp
 * Uses Eastern Time (US market hours)
 */
export function getMarketSessionDate(timestamp: Date = new Date()): Date {
  // Convert to ET (UTC-5 or UTC-4 depending on DST)
  // For simplicity, use UTC-5 (can enhance with DST detection if needed)
  const etOffset = -5 * 60 * 60 * 1000
  const etTime = new Date(timestamp.getTime() + etOffset)

  // If before 4am ET, consider it previous day's session
  if (etTime.getUTCHours() < 4) {
    etTime.setUTCDate(etTime.getUTCDate() - 1)
  }

  // Return date at midnight ET
  etTime.setUTCHours(0, 0, 0, 0)
  return etTime
}

/**
 * Determine which benchmark best explains a stock's move
 * For tech-heavy stocks, prefer QQQ; otherwise SPY
 */
export function selectBenchmark(symbol: string, benchmarks: BenchmarkReturns): 'SPY' | 'QQQ' {
  // Tech-heavy symbols that correlate more with QQQ
  const techHeavy = [
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
    'NFLX', 'ADBE', 'CRM', 'INTC', 'AMD', 'AVGO', 'QCOM', 'TXN',
    'ORCL', 'CSCO', 'INTU', 'AMAT', 'MU', 'LRCX', 'KLAC', 'SNPS'
  ]

  return techHeavy.includes(symbol.toUpperCase()) ? 'QQQ' : 'SPY'
}

/**
 * Calculate if stock move is aligned with market
 * Returns true if stock and benchmark moved in same direction
 */
export function isAlignedWithMarket(
  stockReturn: number,
  benchmarkReturn: number,
  threshold: number = 0.001 // 0.1% threshold for "flat"
): boolean {
  // If both are essentially flat, consider aligned
  if (Math.abs(stockReturn) < threshold && Math.abs(benchmarkReturn) < threshold) {
    return true
  }

  // Check if same direction
  return (stockReturn > 0 && benchmarkReturn > 0) || (stockReturn < 0 && benchmarkReturn < 0)
}

/**
 * Calculate absolute difference between stock and benchmark return
 */
export function calculateReturnDifference(
  stockReturn: number,
  benchmarkReturn: number
): number {
  return Math.abs(stockReturn - benchmarkReturn)
}

/**
 * Format return as percentage string
 */
export function formatReturn(returnValue: number): string {
  const percentage = returnValue * 100
  const sign = percentage > 0 ? '+' : ''
  return `${sign}${percentage.toFixed(2)}%`
}
