export interface MarketStatus {
    isOpen: boolean;
    isPreMarket: boolean;
    isAfterHours: boolean;
    isWeekend: boolean;
    nextOpenTime: Date | null;
    currentSession: 'closed' | 'pre-market' | 'market' | 'after-hours' | 'weekend';
}
/**
 * Check if US stock market is currently open
 */
export declare function isMarketOpen(): boolean;
/**
 * Check if in pre-market hours (4:00 AM - 9:30 AM ET)
 */
export declare function isPreMarket(): boolean;
/**
 * Check if in after-hours trading (4:00 PM - 8:00 PM ET)
 */
export declare function isAfterHours(): boolean;
/**
 * Check if it's the weekend
 */
export declare function isWeekend(): boolean;
/**
 * Get comprehensive market status
 */
export declare function getMarketStatus(): MarketStatus;
/**
 * Check if forex market is open (Sunday 5 PM - Friday 5 PM ET)
 */
export declare function isForexOpen(): boolean;
/**
 * Check if crypto market is open (always true - 24/7)
 */
export declare function isCryptoOpen(): boolean;
/**
 * Determine if we should poll for a given asset type
 */
export declare function shouldPollAsset(symbol: string): boolean;
/**
 * Get appropriate polling interval based on market status
 */
export declare function getPollingInterval(symbols?: string[]): number;
/**
 * Format market status for display
 */
export declare function formatMarketStatus(status: MarketStatus): string;
