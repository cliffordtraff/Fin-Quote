import { ExtendedHoursQuote } from '@watchlist/types';
export interface CachedExtendedHoursData {
    preMarket?: {
        price: number;
        change: number;
        changePercent: number;
        timestamp: string;
    };
    afterHours?: {
        price: number;
        change: number;
        changePercent: number;
        timestamp: string;
    };
    updatedAt: string;
}
/**
 * Save pre-market extended hours data to cache
 */
export declare function savePreMarketCache(symbol: string, data: ExtendedHoursQuote): Promise<void>;
/**
 * Save after-hours extended hours data to cache
 */
export declare function saveAfterHoursCache(symbol: string, data: ExtendedHoursQuote): Promise<void>;
/**
 * Get cached extended hours data for a symbol
 */
export declare function getCachedExtendedHours(symbol: string): Promise<CachedExtendedHoursData | null>;
/**
 * Batch save pre-market data for multiple symbols
 */
export declare function batchSavePreMarket(data: Map<string, ExtendedHoursQuote>): Promise<void>;
/**
 * Batch save after-hours data for multiple symbols
 */
export declare function batchSaveAfterHours(data: Map<string, ExtendedHoursQuote>): Promise<void>;
