/**
 * localStorage cache utility for optimistic UI
 * Provides instant data loading with background updates
 */

interface CachedData<T> {
  data: T
  timestamp: number
  version: string
  ttl?: number // Optional TTL in milliseconds
}

export class LocalStorageCache {
  private version = '1.0.0' // Bump this to invalidate old cache
  
  /**
   * Get cached data if it exists and is fresh
   * @param key - Cache key
   * @param maxAge - Maximum age in milliseconds (used if no stored TTL)
   * @returns Cached data or null if not found/expired
   */
  get<T>(key: string, maxAge: number): T | null {
    try {
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const parsed: CachedData<T> = JSON.parse(cached)

      // Check version
      if (parsed.version !== this.version) {
        this.remove(key)
        return null
      }

      // Use stored TTL if available, otherwise use maxAge parameter
      const effectiveTTL = parsed.ttl ?? maxAge

      // Check age
      if (Date.now() - parsed.timestamp > effectiveTTL) {
        return null // Too old
      }

      console.log(`[Cache HIT] ${key} (age: ${Math.round((Date.now() - parsed.timestamp) / 1000)}s, TTL: ${Math.round(effectiveTTL / 1000)}s)`)
      return parsed.data
    } catch (error) {
      console.error('Cache read error:', error)
      return null
    }
  }

  /**
   * Get cached data even if stale (expired)
   * Used for stale-while-revalidate pattern
   * @param key - Cache key
   * @returns Cached data with metadata or null if not found
   */
  getStale<T>(key: string): { data: T; timestamp: number; isStale: boolean; age: number } | null {
    try {
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const parsed: CachedData<T> = JSON.parse(cached)

      // Check version
      if (parsed.version !== this.version) {
        this.remove(key)
        return null
      }

      const age = Date.now() - parsed.timestamp
      const effectiveTTL = parsed.ttl ?? 30000 // Default to 30s if no TTL stored
      const isStale = age > effectiveTTL

      console.log(`[Cache ${isStale ? 'STALE' : 'HIT'}] ${key} (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(effectiveTTL / 1000)}s)`)

      return {
        data: parsed.data,
        timestamp: parsed.timestamp,
        isStale,
        age
      }
    } catch (error) {
      console.error('Cache read error:', error)
      return null
    }
  }
  
  /**
   * Set data in cache
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Optional TTL in milliseconds (overrides default maxAge in get())
   */
  set<T>(key: string, data: T, ttl?: number): void {
    try {
      const cacheData: CachedData<T> = {
        data,
        timestamp: Date.now(),
        version: this.version,
        ...(ttl !== undefined && { ttl })
      }
      localStorage.setItem(key, JSON.stringify(cacheData))
      console.log(`[Cache SET] ${key}${ttl ? ` (TTL: ${Math.round(ttl / 1000)}s)` : ''}`)
    } catch (error) {
      console.error('Cache write error:', error)
      // If localStorage is full, clear old data
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.log('localStorage full, clearing old data...')
        this.clearOldest()
        // Try again
        try {
          const retryData: CachedData<T> = {
            data,
            timestamp: Date.now(),
            version: this.version,
            ...(ttl !== undefined && { ttl })
          }
          localStorage.setItem(key, JSON.stringify(retryData))
        } catch (retryError) {
          console.error('Cache write failed after cleanup:', retryError)
        }
      }
    }
  }
  
  /**
   * Remove item from cache
   */
  remove(key: string): void {
    localStorage.removeItem(key)
    console.log(`[Cache REMOVE] ${key}`)
  }
  
  /**
   * Clear cache items older than specified age
   */
  clearOldest(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAgeMs
    let cleared = 0
    
    Object.keys(localStorage).forEach(key => {
      try {
        const item = localStorage.getItem(key)
        if (item) {
          const parsed = JSON.parse(item)
          if (parsed.timestamp && parsed.timestamp < cutoffTime) {
            localStorage.removeItem(key)
            cleared++
          }
        }
      } catch {
        // Ignore non-cache items
      }
    })
    
    console.log(`[Cache] Cleared ${cleared} old items`)
  }
  
  /**
   * Clear all cache (but preserve other localStorage data)
   */
  clearAll(): void {
    const cacheKeys: string[] = []
    
    Object.keys(localStorage).forEach(key => {
      try {
        const item = localStorage.getItem(key)
        if (item) {
          const parsed = JSON.parse(item)
          // Only clear items with our cache structure
          if (parsed.version && parsed.timestamp) {
            cacheKeys.push(key)
          }
        }
      } catch {
        // Ignore non-cache items
      }
    })
    
    cacheKeys.forEach(key => localStorage.removeItem(key))
    console.log(`[Cache] Cleared ${cacheKeys.length} cache items`)
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { count: number; sizeKB: number; oldest: Date | null } {
    let count = 0
    let size = 0
    let oldest: number | null = null
    
    Object.keys(localStorage).forEach(key => {
      try {
        const item = localStorage.getItem(key)
        if (item) {
          const parsed = JSON.parse(item)
          if (parsed.version && parsed.timestamp) {
            count++
            size += item.length
            if (!oldest || parsed.timestamp < oldest) {
              oldest = parsed.timestamp
            }
          }
        }
      } catch {
        // Ignore non-cache items
      }
    })
    
    return {
      count,
      sizeKB: Math.round(size / 1024),
      oldest: oldest ? new Date(oldest) : null
    }
  }
}

// Export singleton instance
export const cache = new LocalStorageCache()