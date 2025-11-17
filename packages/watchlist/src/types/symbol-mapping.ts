import { Timestamp } from 'firebase/firestore';

/**
 * V2 Enhanced schema for symbol mappings
 * Maps between FMP symbols and TradingView symbols
 * Document key: {exchange}:{symbol} to prevent collisions
 */
export interface SymbolMappingV2 {
  // Core identifiers
  fmpSymbol: string;                  // e.g., "BABA"
  tvSymbol: string;                   // e.g., "NYSE:BABA"
  exchange: string;                   // Normalized for TV, e.g., "NYSE"
  name: string;                        // e.g., "Alibaba Group Holding Ltd"
  type: 'stock' | 'etf' | 'index';
  
  // Status tracking
  active: boolean;                     // false for delisted symbols
  supersededBy?: string;              // Points to new symbol if renamed (e.g., "META" for old "FB")
  
  // Quality tracking
  source: 'automatic' | 'manual';     // How mapping was created
  confidence: 'verified' | 'unverified'; // Simplified from 3 states to 2
  lastVerified: Timestamp;             // Last successful verification
  
  // Usage tracking (critical for smart verification)
  usageCount: number;                 // Times accessed (for verification priority)
  lastUsed?: Timestamp;               // When last accessed
}

// Keep V1 for backward compatibility during migration
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
  hasPrice: boolean;  // FMP has price data
  hasChart: boolean;  // TradingView has chart
}