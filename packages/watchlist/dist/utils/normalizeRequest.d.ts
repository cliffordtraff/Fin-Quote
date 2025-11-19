/**
 * Request normalization utilities for consistent API handling
 */
/**
 * Normalize symbol strings for consistent processing
 * Examples:
 * "aapl, msft" → ["AAPL", "MSFT"]
 * "MSFT,AAPL,AAPL" → ["AAPL", "MSFT"]
 * " BTC-USD , spy " → ["BTC-USD", "SPY"]
 */
export declare function normalizeSymbols(symbolString: string | null | undefined): string[];
/**
 * Create a consistent cache key from symbols and data type
 */
export declare function getCacheKey(symbols: string[], dataType: string): string;
/**
 * Parse include parameter to determine what data to fetch
 * Example: "quotes,dividends" → ["quotes", "dividends"]
 */
export declare function parseIncludes(includeString: string | null | undefined): string[];
/**
 * Get cache TTL based on data type and market hours
 */
export declare function getCacheTTL(dataType: string): number;
/**
 * Validate symbols array
 */
export declare function validateSymbols(symbols: string[]): {
    valid: string[];
    invalid: string[];
};
