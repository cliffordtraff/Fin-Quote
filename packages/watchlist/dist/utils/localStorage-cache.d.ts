/**
 * localStorage cache utility for optimistic UI
 * Provides instant data loading with background updates
 */
export declare class LocalStorageCache {
    private version;
    /**
     * Get cached data if it exists and is fresh
     * @param key - Cache key
     * @param maxAge - Maximum age in milliseconds (used if no stored TTL)
     * @returns Cached data or null if not found/expired
     */
    get<T>(key: string, maxAge: number): T | null;
    /**
     * Get cached data even if stale (expired)
     * Used for stale-while-revalidate pattern
     * @param key - Cache key
     * @returns Cached data with metadata or null if not found
     */
    getStale<T>(key: string): {
        data: T;
        timestamp: number;
        isStale: boolean;
        age: number;
    } | null;
    /**
     * Set data in cache
     * @param key - Cache key
     * @param data - Data to cache
     * @param ttl - Optional TTL in milliseconds (overrides default maxAge in get())
     */
    set<T>(key: string, data: T, ttl?: number): void;
    /**
     * Remove item from cache
     */
    remove(key: string): void;
    /**
     * Clear cache items older than specified age
     */
    clearOldest(maxAgeMs?: number): void;
    /**
     * Clear all cache (but preserve other localStorage data)
     */
    clearAll(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        count: number;
        sizeKB: number;
        oldest: Date | null;
    };
}
export declare const cache: LocalStorageCache;
