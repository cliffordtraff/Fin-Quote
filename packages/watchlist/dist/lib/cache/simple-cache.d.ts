/**
 * Simple in-memory cache with TTL support
 * This is a beginner-friendly cache implementation that doesn't require Redis
 */
declare class SimpleCache {
    private cache;
    private maxSize;
    /**
     * Store data in cache with TTL
     */
    set<T>(key: string, data: T, ttlSeconds: number): void;
    /**
     * Get data from cache if not expired
     */
    get<T>(key: string): {
        data: T;
        timestamp: string;
    } | null;
    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean;
    /**
     * Get data even if expired (for fallback scenarios)
     */
    getStale<T>(key: string): {
        data: T;
        timestamp: string;
        isStale: boolean;
    } | null;
    /**
     * Remove oldest entries when cache is full
     */
    private evictOldest;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        keys: string[];
    };
    /**
     * Clean up expired entries
     */
    cleanup(): number;
}
export declare const quotesCache: SimpleCache;
export declare const dividendsCache: SimpleCache;
export declare const newsCache: SimpleCache;
export declare const metadataCache: SimpleCache;
export declare const stockDataCache: {
    quotes: SimpleCache;
    dividends: SimpleCache;
    news: SimpleCache;
    metadata: SimpleCache;
    clearAll(): void;
    getAllStats(): {
        quotes: {
            size: number;
            maxSize: number;
            keys: string[];
        };
        dividends: {
            size: number;
            maxSize: number;
            keys: string[];
        };
        news: {
            size: number;
            maxSize: number;
            keys: string[];
        };
        metadata: {
            size: number;
            maxSize: number;
            keys: string[];
        };
    };
};
export {};
