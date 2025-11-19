/**
 * Firestore Earnings Service
 *
 * Handles caching and retrieval of earnings data from Firestore
 */
import { EarningsData, EarningsCache, EarningsContext } from '@watchlist/types/earnings';
/**
 * Firestore Earnings Service
 */
export declare class EarningsService {
    /**
     * Cache earnings data for a symbol (with denormalized fields)
     */
    cacheEarnings(symbol: string, earningsData: EarningsData[]): Promise<void>;
    /**
     * Get cached earnings for symbol
     */
    getEarnings(symbol: string): Promise<EarningsCache | null>;
    /**
     * Batch get earnings for multiple symbols (reduce round-trips)
     */
    getBatchEarnings(symbols: string[]): Promise<Map<string, EarningsContext>>;
    /**
     * Check if cache is fresh
     */
    isCacheFresh(symbol: string): Promise<boolean>;
    /**
     * Batch update earnings for multiple symbols
     */
    batchCacheEarnings(earningsMap: Map<string, EarningsData[]>): Promise<void>;
    /**
     * Cache earnings calendar for a date
     */
    cacheCalendar(date: string, symbols: string[]): Promise<void>;
    /**
     * Compute status and denormalized fields from earnings data
     */
    private computeStatus;
}
/**
 * Default singleton instance
 */
export declare const earningsService: EarningsService;
