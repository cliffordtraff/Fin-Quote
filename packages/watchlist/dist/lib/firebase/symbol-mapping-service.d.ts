import type { SymbolMappingV2, UserSymbolOverride } from '@watchlist/types/symbol-mapping';
/**
 * Normalize exchange name for TradingView compatibility
 * ARCA ETFs use NYSEARCA prefix in TradingView
 */
export declare function normalizeExchangeForTV(exchange: string, type: 'stock' | 'etf' | 'index'): string;
/**
 * Get a symbol mapping by exchange and symbol
 */
export declare function getSymbolMapping(exchange: string, symbol: string): Promise<SymbolMappingV2 | null>;
/**
 * Get a symbol mapping by FMP symbol (tries common exchanges)
 * This is a convenience function for when we only have the symbol
 * Note: NYSEARCA is the TradingView prefix for NYSE ETFs
 */
export declare function getSymbolMappingByFmpSymbol(fmpSymbol: string): Promise<SymbolMappingV2 | null>;
/**
 * Get multiple symbol mappings by FMP symbols
 */
export declare function getSymbolMappings(fmpSymbols: string[]): Promise<Map<string, SymbolMappingV2>>;
/**
 * Create or update a symbol mapping (server-only)
 * Uses exchange:symbol as document key
 */
export declare function upsertSymbolMapping(mapping: Omit<SymbolMappingV2, 'usageCount' | 'lastUsed'>): Promise<void>;
/**
 * Batch upsert multiple symbol mappings
 * Chunks into batches of 500 (Firestore limit)
 */
export declare function batchUpsertSymbolMappings(mappings: Omit<SymbolMappingV2, 'usageCount' | 'lastUsed'>[]): Promise<{
    success: number;
    failed: number;
}>;
/**
 * Increment usage count for a symbol mapping (atomic operation)
 * This prevents race conditions when multiple users access simultaneously
 */
export declare function incrementMappingUsage(exchange: string, symbol: string): Promise<void>;
/**
 * Increment usage by FMP symbol (tries common exchanges)
 */
export declare function incrementMappingUsageByFmpSymbol(fmpSymbol: string): Promise<void>;
/**
 * Get top N most used symbol mappings
 */
export declare function getTopUsedMappings(n?: number): Promise<SymbolMappingV2[]>;
/**
 * Get mappings that need verification
 */
export declare function getMappingsForVerification(minUsageCount?: number): Promise<SymbolMappingV2[]>;
/**
 * Mark a mapping as verified
 */
export declare function markMappingVerified(exchange: string, symbol: string): Promise<void>;
/**
 * Mark a mapping as inactive (for delisted symbols)
 */
export declare function markMappingInactive(exchange: string, symbol: string, supersededBy?: string): Promise<void>;
/**
 * Get user-specific symbol override
 */
export declare function getUserSymbolOverride(userId: string, fmpSymbol: string): Promise<UserSymbolOverride | null>;
/**
 * Set user-specific symbol override
 */
export declare function setUserSymbolOverride(userId: string, fmpSymbol: string, tvSymbol: string): Promise<void>;
