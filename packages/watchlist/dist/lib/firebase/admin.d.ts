export declare const auth: import("firebase-admin/auth").Auth;
export declare const db: FirebaseFirestore.Firestore;
export declare function saveDividendDataAsAdmin(symbol: string, exDate: string | null, paymentDate: string | null, amount: number | null, updatedBy?: 'cron' | 'on-demand' | 'manual'): Promise<boolean>;
export declare function getDividendDataAsAdmin(symbols: string[]): Promise<Map<string, any>>;
export declare function scanUserWatchlists(): Promise<Set<string>>;
/**
 * Update materialized active symbols set
 * Call this when a symbol is added/removed from any watchlist
 * Maintains /admin/meta/activeSymbols with current symbol list
 */
export declare function updateActiveSymbolsSet(): Promise<boolean>;
/**
 * Get active symbols from materialized set
 * Much faster than scanning all watchlists (1 read vs hundreds)
 * Falls back to scanning if materialized set doesn't exist
 */
export declare function getActiveSymbols(): Promise<Set<string>>;
/**
 * Save stock quote data to Firestore global cache with schema versioning
 * @param symbol Stock symbol (e.g., "AAPL")
 * @param quoteData Stock data from FMP API
 * @param updatedBy Source of update ('cron' | 'on-demand' | 'manual')
 */
export declare function saveQuoteDataAsAdmin(symbol: string, quoteData: any, // Using any to avoid circular import of Stock type
updatedBy?: 'cron' | 'on-demand' | 'manual'): Promise<boolean>;
/**
 * Batch read stock quotes from Firestore global cache with memory fallback
 * @param symbols Array of stock symbols to fetch
 * @returns Map of symbol -> quote data
 */
export declare function getQuoteDataAsAdmin(symbols: string[]): Promise<Map<string, any>>;
