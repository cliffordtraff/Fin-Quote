/**
 * localStorage cache utility for optimistic UI
 * Provides instant data loading with background updates
 */
export class LocalStorageCache {
    constructor() {
        this.version = '1.0.0'; // Bump this to invalidate old cache
    }
    /**
     * Get cached data if it exists and is fresh
     * @param key - Cache key
     * @param maxAge - Maximum age in milliseconds (used if no stored TTL)
     * @returns Cached data or null if not found/expired
     */
    get(key, maxAge) {
        var _a;
        try {
            const cached = localStorage.getItem(key);
            if (!cached)
                return null;
            const parsed = JSON.parse(cached);
            // Check version
            if (parsed.version !== this.version) {
                this.remove(key);
                return null;
            }
            // Use stored TTL if available, otherwise use maxAge parameter
            const effectiveTTL = (_a = parsed.ttl) !== null && _a !== void 0 ? _a : maxAge;
            // Check age
            if (Date.now() - parsed.timestamp > effectiveTTL) {
                return null; // Too old
            }
            console.log(`[Cache HIT] ${key} (age: ${Math.round((Date.now() - parsed.timestamp) / 1000)}s, TTL: ${Math.round(effectiveTTL / 1000)}s)`);
            return parsed.data;
        }
        catch (error) {
            console.error('Cache read error:', error);
            return null;
        }
    }
    /**
     * Get cached data even if stale (expired)
     * Used for stale-while-revalidate pattern
     * @param key - Cache key
     * @returns Cached data with metadata or null if not found
     */
    getStale(key) {
        var _a;
        try {
            const cached = localStorage.getItem(key);
            if (!cached)
                return null;
            const parsed = JSON.parse(cached);
            // Check version
            if (parsed.version !== this.version) {
                this.remove(key);
                return null;
            }
            const age = Date.now() - parsed.timestamp;
            const effectiveTTL = (_a = parsed.ttl) !== null && _a !== void 0 ? _a : 30000; // Default to 30s if no TTL stored
            const isStale = age > effectiveTTL;
            console.log(`[Cache ${isStale ? 'STALE' : 'HIT'}] ${key} (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(effectiveTTL / 1000)}s)`);
            return {
                data: parsed.data,
                timestamp: parsed.timestamp,
                isStale,
                age
            };
        }
        catch (error) {
            console.error('Cache read error:', error);
            return null;
        }
    }
    /**
     * Set data in cache
     * @param key - Cache key
     * @param data - Data to cache
     * @param ttl - Optional TTL in milliseconds (overrides default maxAge in get())
     */
    set(key, data, ttl) {
        try {
            const cacheData = Object.assign({ data, timestamp: Date.now(), version: this.version }, (ttl !== undefined && { ttl }));
            localStorage.setItem(key, JSON.stringify(cacheData));
            console.log(`[Cache SET] ${key}${ttl ? ` (TTL: ${Math.round(ttl / 1000)}s)` : ''}`);
        }
        catch (error) {
            console.error('Cache write error:', error);
            // If localStorage is full, clear old data
            if (error instanceof Error && error.name === 'QuotaExceededError') {
                console.log('localStorage full, clearing old data...');
                this.clearOldest();
                // Try again
                try {
                    const retryData = Object.assign({ data, timestamp: Date.now(), version: this.version }, (ttl !== undefined && { ttl }));
                    localStorage.setItem(key, JSON.stringify(retryData));
                }
                catch (retryError) {
                    console.error('Cache write failed after cleanup:', retryError);
                }
            }
        }
    }
    /**
     * Remove item from cache
     */
    remove(key) {
        localStorage.removeItem(key);
        console.log(`[Cache REMOVE] ${key}`);
    }
    /**
     * Clear cache items older than specified age
     */
    clearOldest(maxAgeMs = 24 * 60 * 60 * 1000) {
        const cutoffTime = Date.now() - maxAgeMs;
        let cleared = 0;
        Object.keys(localStorage).forEach(key => {
            try {
                const item = localStorage.getItem(key);
                if (item) {
                    const parsed = JSON.parse(item);
                    if (parsed.timestamp && parsed.timestamp < cutoffTime) {
                        localStorage.removeItem(key);
                        cleared++;
                    }
                }
            }
            catch (_a) {
                // Ignore non-cache items
            }
        });
        console.log(`[Cache] Cleared ${cleared} old items`);
    }
    /**
     * Clear all cache (but preserve other localStorage data)
     */
    clearAll() {
        const cacheKeys = [];
        Object.keys(localStorage).forEach(key => {
            try {
                const item = localStorage.getItem(key);
                if (item) {
                    const parsed = JSON.parse(item);
                    // Only clear items with our cache structure
                    if (parsed.version && parsed.timestamp) {
                        cacheKeys.push(key);
                    }
                }
            }
            catch (_a) {
                // Ignore non-cache items
            }
        });
        cacheKeys.forEach(key => localStorage.removeItem(key));
        console.log(`[Cache] Cleared ${cacheKeys.length} cache items`);
    }
    /**
     * Get cache statistics
     */
    getStats() {
        let count = 0;
        let size = 0;
        let oldest = null;
        Object.keys(localStorage).forEach(key => {
            try {
                const item = localStorage.getItem(key);
                if (item) {
                    const parsed = JSON.parse(item);
                    if (parsed.version && parsed.timestamp) {
                        count++;
                        size += item.length;
                        if (!oldest || parsed.timestamp < oldest) {
                            oldest = parsed.timestamp;
                        }
                    }
                }
            }
            catch (_a) {
                // Ignore non-cache items
            }
        });
        return {
            count,
            sizeKB: Math.round(size / 1024),
            oldest: oldest ? new Date(oldest) : null
        };
    }
}
// Export singleton instance
export const cache = new LocalStorageCache();
