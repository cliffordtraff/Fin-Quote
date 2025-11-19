/**
 * Formats dividend yield for display
 * - Shows "0.00" only for confirmed zero yields
 * - Handles very small numbers appropriately
 * - Note: null/undefined values are handled in the component with proper styling
 */
export declare const formatDividendYield: (yieldValue?: number | null, basis?: string) => string;
/**
 * Formats ex-dividend date for display
 */
export declare const formatExDividendDate: (date?: string | null) => string;
/**
 * Formats price for display
 */
export declare const formatPrice: (price?: number | null) => string;
/**
 * Formats percentage change for display
 */
export declare const formatPercentChange: (change?: number | null) => string;
/**
 * Formats large numbers (volume, market cap)
 */
export declare const formatLargeNumber: (num?: number | null) => string;
