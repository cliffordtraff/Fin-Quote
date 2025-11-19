/**
 * Simple in-memory cache with TTL support
 * This is a beginner-friendly cache implementation that doesn't require Redis
 */
class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 100; // Maximum number of cache entries
    }
    /**
     * Store data in cache with TTL
     */
    set(key, data, ttlSeconds) {
        // Clean up if cache is getting too large
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        const expires = Date.now() + (ttlSeconds * 1000);
        const timestamp = new Date().toISOString();
        this.cache.set(key, {
            data,
            expires,
            timestamp
        });
        console.log(`[Cache] SET ${key} (TTL: ${ttlSeconds}s)`);
    }
    /**
     * Get data from cache if not expired
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            console.log(`[Cache] MISS ${key} (not found)`);
            return null;
        }
        // Check if expired
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            console.log(`[Cache] MISS ${key} (expired)`);
            return null;
        }
        console.log(`[Cache] HIT ${key}`);
        return {
            data: item.data,
            timestamp: item.timestamp
        };
    }
    /**
     * Check if key exists and is not expired
     */
    has(key) {
        const item = this.cache.get(key);
        if (!item)
            return false;
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    /**
     * Get data even if expired (for fallback scenarios)
     */
    getStale(key) {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }
        const isStale = Date.now() > item.expires;
        console.log(`[Cache] GET_STALE ${key} (stale: ${isStale})`);
        return {
            data: item.data,
            timestamp: item.timestamp,
            isStale
        };
    }
    /**
     * Remove oldest entries when cache is full
     */
    evictOldest() {
        // Get the oldest entry (first one added)
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
            this.cache.delete(firstKey);
            console.log(`[Cache] EVICTED ${firstKey} (size limit)`);
        }
    }
    /**
     * Clear all cache entries
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`[Cache] CLEARED ${size} entries`);
    }
    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            keys: Array.from(this.cache.keys())
        };
    }
    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expires) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[Cache] CLEANUP removed ${cleaned} expired entries`);
        }
        return cleaned;
    }
}
// Create singleton instances for different data types
export const quotesCache = new SimpleCache();
export const dividendsCache = new SimpleCache();
export const newsCache = new SimpleCache();
export const metadataCache = new SimpleCache();
// Optional: Set up periodic cleanup (every 5 minutes)
if (typeof window === 'undefined') { // Only on server
    setInterval(() => {
        quotesCache.cleanup();
        dividendsCache.cleanup();
        newsCache.cleanup();
        metadataCache.cleanup();
    }, 5 * 60 * 1000);
}
// Export a unified cache interface
export const stockDataCache = {
    quotes: quotesCache,
    dividends: dividendsCache,
    news: newsCache,
    metadata: metadataCache,
    // Convenience method to clear all caches
    clearAll() {
        quotesCache.clear();
        dividendsCache.clear();
        newsCache.clear();
        metadataCache.clear();
    },
    // Get stats for all caches
    getAllStats() {
        return {
            quotes: quotesCache.getStats(),
            dividends: dividendsCache.getStats(),
            news: newsCache.getStats(),
            metadata: metadataCache.getStats()
        };
    }
};
