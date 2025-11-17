/**
 * Firestore Earnings Service
 *
 * Handles caching and retrieval of earnings data from Firestore
 */

import { db } from './config'
import { EarningsData, EarningsCache, EarningsContext, EarningsCalendar } from '@watchlist/types/earnings'
import { collection, doc, getDoc, setDoc, writeBatch, getDocs, query, where } from 'firebase/firestore'

const EARNINGS_COLLECTION = 'earnings'
const CALENDAR_COLLECTION = 'earningsCalendar'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Firestore Earnings Service
 */
export class EarningsService {
  /**
   * Cache earnings data for a symbol (with denormalized fields)
   */
  async cacheEarnings(symbol: string, earningsData: EarningsData[]): Promise<void> {
    if (!symbol || earningsData.length === 0) return

    try {
      const now = Date.now()
      const ttl = now + CACHE_TTL

      // Separate upcoming and recent earnings
      const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now)
      const recent = earningsData
        .filter(e => new Date(e.date).getTime() < now)
        .slice(0, 4) // Keep last 4 quarters only

      // Precompute denormalized fields
      const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(
        upcoming,
        recent[0] // most recent past earnings
      )

      const cacheDoc: EarningsCache = {
        symbol,
        upcoming: upcoming || null,
        recent,
        status,
        daysAway,
        daysSince,
        eventTimestampUtc,
        cachedAt: now,
        ttl
      }

      const docRef = doc(db, EARNINGS_COLLECTION, symbol)
      await setDoc(docRef, cacheDoc)

      console.log(`[Earnings Service] Cached earnings for ${symbol}:`, {
        status,
        daysAway,
        daysSince
      })
    } catch (error) {
      console.error(`[Earnings Service] Error caching earnings for ${symbol}:`, error)
    }
  }

  /**
   * Get cached earnings for symbol
   */
  async getEarnings(symbol: string): Promise<EarningsCache | null> {
    if (!symbol) return null

    try {
      const docRef = doc(db, EARNINGS_COLLECTION, symbol)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      const data = docSnap.data() as EarningsCache

      // Check if cache is fresh
      if (Date.now() > data.ttl) {
        console.log(`[Earnings Service] Cache expired for ${symbol}`)
        return null
      }

      return data
    } catch (error) {
      console.error(`[Earnings Service] Error getting earnings for ${symbol}:`, error)
      return null
    }
  }

  /**
   * Batch get earnings for multiple symbols (reduce round-trips)
   */
  async getBatchEarnings(symbols: string[]): Promise<Map<string, EarningsContext>> {
    const results = new Map<string, EarningsContext>()

    if (symbols.length === 0) return results

    try {
      // Firestore batch get (parallel reads)
      const promises = symbols.map(symbol =>
        this.getEarnings(symbol).then(cache => ({ symbol, cache }))
      )

      const allResults = await Promise.all(promises)

      for (const { symbol, cache } of allResults) {
        if (cache) {
          // Convert cache to context
          results.set(symbol, {
            status: cache.status,
            daysAway: cache.daysAway ?? undefined,
            daysSince: cache.daysSince ?? undefined,
            lastEarnings: cache.recent[0],
            nextEarnings: cache.upcoming ?? undefined,
            impactConfidence: 0 // Will be calculated by confidence calculator
          })
        }
      }

      console.log(`[Earnings Service] Batch fetched ${results.size}/${symbols.length} symbols`)
    } catch (error) {
      console.error('[Earnings Service] Error in batch fetch:', error)
    }

    return results
  }

  /**
   * Check if cache is fresh
   */
  async isCacheFresh(symbol: string): Promise<boolean> {
    const cache = await this.getEarnings(symbol)
    return cache !== null
  }

  /**
   * Batch update earnings for multiple symbols
   */
  async batchCacheEarnings(earningsMap: Map<string, EarningsData[]>): Promise<void> {
    if (earningsMap.size === 0) return

    try {
      const batch = writeBatch(db)
      const now = Date.now()
      const ttl = now + CACHE_TTL

      let count = 0
      for (const [symbol, earningsData] of earningsMap.entries()) {
        if (earningsData.length === 0) continue

        const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now)
        const recent = earningsData
          .filter(e => new Date(e.date).getTime() < now)
          .slice(0, 4)

        const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(
          upcoming,
          recent[0]
        )

        const cacheDoc: EarningsCache = {
          symbol,
          upcoming: upcoming || null,
          recent,
          status,
          daysAway,
          daysSince,
          eventTimestampUtc,
          cachedAt: now,
          ttl
        }

        const docRef = doc(db, EARNINGS_COLLECTION, symbol)
        batch.set(docRef, cacheDoc)
        count++

        // Firestore batch limit is 500 operations
        if (count >= 500) {
          await batch.commit()
          console.log(`[Earnings Service] Committed batch of ${count} symbols`)
          count = 0
        }
      }

      // Commit remaining
      if (count > 0) {
        await batch.commit()
        console.log(`[Earnings Service] Committed final batch of ${count} symbols`)
      }

      console.log(`[Earnings Service] Batch cached ${earningsMap.size} symbols`)
    } catch (error) {
      console.error('[Earnings Service] Error in batch cache:', error)
    }
  }

  /**
   * Cache earnings calendar for a date
   */
  async cacheCalendar(date: string, symbols: string[]): Promise<void> {
    try {
      const now = Date.now()
      const ttl = now + CACHE_TTL

      const calendarDoc: EarningsCalendar = {
        date,
        symbols,
        cachedAt: now,
        ttl
      }

      const docRef = doc(db, CALENDAR_COLLECTION, date)
      await setDoc(docRef, calendarDoc)

      console.log(`[Earnings Service] Cached calendar for ${date}: ${symbols.length} symbols`)
    } catch (error) {
      console.error(`[Earnings Service] Error caching calendar for ${date}:`, error)
    }
  }

  /**
   * Compute status and denormalized fields from earnings data
   */
  private computeStatus(
    upcoming: EarningsData | undefined,
    recent: EarningsData | undefined
  ): {
    status: EarningsCache['status']
    daysAway: number | null
    daysSince: number | null
    eventTimestampUtc: number | null
  } {
    const now = Date.now()
    const MS_PER_DAY = 24 * 60 * 60 * 1000

    // Check upcoming earnings
    if (upcoming) {
      const earningsTime = upcoming.eventTimestampUtc
      const diffMs = earningsTime - now
      const diffDays = Math.floor(diffMs / MS_PER_DAY)

      // Is it today?
      if (diffDays === 0) {
        // Distinguish BMO vs AMC
        const status = upcoming.time === 'bmo' ? 'today_bmo' : 'today_amc'
        return {
          status,
          daysAway: 0,
          daysSince: null,
          eventTimestampUtc: earningsTime
        }
      }

      // Is it upcoming (1-7 days)?
      if (diffDays > 0 && diffDays <= 7) {
        return {
          status: 'upcoming',
          daysAway: diffDays,
          daysSince: null,
          eventTimestampUtc: earningsTime
        }
      }
    }

    // Check recent earnings
    if (recent) {
      const earningsTime = recent.eventTimestampUtc
      const diffMs = now - earningsTime
      const diffDays = Math.floor(diffMs / MS_PER_DAY)

      // Is it recent (1-7 days ago)?
      if (diffDays >= 0 && diffDays <= 7) {
        return {
          status: 'recent',
          daysAway: null,
          daysSince: diffDays,
          eventTimestampUtc: earningsTime
        }
      }
    }

    // No earnings nearby
    return {
      status: 'none',
      daysAway: null,
      daysSince: null,
      eventTimestampUtc: upcoming?.eventTimestampUtc || recent?.eventTimestampUtc || null
    }
  }
}

/**
 * Default singleton instance
 */
export const earningsService = new EarningsService()
