/**
 * Detect if a symbol is cryptocurrency
 * Crypto trades 24/7, so always use short cache
 */
export declare function isCryptoSymbol(symbol: string): boolean;
/**
 * Get current time in Eastern Time
 */
export declare function getCurrentETTime(): Date;
/**
 * Check if market is currently open
 * Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET
 * Does not account for holidays (simplified approach)
 */
export declare function isMarketOpen(etTime?: Date): boolean;
/**
 * Get the next market open time
 * Returns a Date object for when the market will next open
 */
export declare function getNextMarketOpen(etTime?: Date): Date;
/**
 * Calculate smart cache TTL based on market state and symbols
 *
 * Logic:
 * - If any symbol is crypto → use baseline TTL (30s)
 * - If market is open → use baseline TTL (30s)
 * - If market is closed → cache until next market open
 *
 * @param symbols - Array of stock symbols to check
 * @param baselineTTL - Default TTL in milliseconds (usually 30000 = 30s)
 * @returns TTL in milliseconds
 */
export declare function getSmartCacheTTL(symbols: string[], baselineTTL?: number): number;
