export type AssetType = 'stock' | 'crypto' | 'forex' | 'futures' | 'unknown';
export interface SymbolData {
    original: string;
    normalized: string;
    display: string;
    type?: AssetType;
    lastValid?: Date;
}
export interface SymbolStatus {
    state: 'loading' | 'valid' | 'invalid' | 'error' | 'stale';
    message?: string;
    lastAttempt?: Date;
    retryCount?: number;
}
/**
 * Detect asset type from symbol pattern
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Pattern matching for asset types
 */
export declare function detectAssetType(symbol: string): AssetType;
/**
 * Normalize symbol to standard format
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 2: Handle different symbol formats
 */
export declare function normalizeSymbol(input: string): SymbolData;
/**
 * Get appropriate price range for asset type
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Generate appropriate fallback data
 */
export declare function getPriceRangeForType(type: AssetType): {
    min: number;
    max: number;
    decimals: number;
};
/**
 * Get appropriate volatility for asset type
 * Reference: SYMBOL_SUPPORT_PLAN.md - Phase 1: Different volatility per type
 */
export declare function getVolatilityForType(type: AssetType): number;
/**
 * Generate a realistic base price for unknown symbols
 */
export declare function generateBasePrice(symbol: string, type: AssetType): number;
