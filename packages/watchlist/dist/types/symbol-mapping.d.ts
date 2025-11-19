import { Timestamp } from 'firebase/firestore';
/**
 * V2 Enhanced schema for symbol mappings
 * Maps between FMP symbols and TradingView symbols
 * Document key: {exchange}:{symbol} to prevent collisions
 */
export interface SymbolMappingV2 {
    fmpSymbol: string;
    tvSymbol: string;
    exchange: string;
    name: string;
    type: 'stock' | 'etf' | 'index';
    active: boolean;
    supersededBy?: string;
    source: 'automatic' | 'manual';
    confidence: 'verified' | 'unverified';
    lastVerified: Timestamp;
    usageCount: number;
    lastUsed?: Timestamp;
}
export type SymbolMappingV1 = SymbolMappingV2;
/**
 * User-specific symbol mapping override
 * Allows users to correct wrong mappings for their account
 */
export interface UserSymbolOverride {
    userId: string;
    fmpSymbol: string;
    tvSymbol: string;
    createdAt: Timestamp;
}
/**
 * API response format for symbol mapping lookups
 */
export interface SymbolMappingResponse {
    fmpSymbol: string;
    tvSymbol: string;
    exchange: string;
    name: string;
    type: 'stock' | 'etf' | 'index';
    source: 'automatic' | 'manual';
    confidence: 'verified' | 'unverified';
    hasPrice: boolean;
    hasChart: boolean;
}
