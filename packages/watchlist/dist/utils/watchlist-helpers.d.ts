import { WatchlistEntry, WatchlistTab, WatchlistStock, WatchlistHeader } from '@watchlist/types';
/**
 * Migrate old format (symbols array) to new format (items array)
 */
export declare function migrateWatchlistTab(tab: WatchlistTab): WatchlistTab;
/**
 * Get all stock symbols from a watchlist tab (excludes headers)
 */
export declare function getStockSymbols(tab: WatchlistTab): string[];
/**
 * Get all items as a flat array (for backward compatibility)
 */
export declare function getAllSymbols(tab: WatchlistTab): string[];
/**
 * Check if an item is a stock
 */
export declare function isStock(item: WatchlistEntry): item is WatchlistStock;
/**
 * Check if an item is a header
 */
export declare function isHeader(item: WatchlistEntry): item is WatchlistHeader;
/**
 * Add a stock to the watchlist
 */
export declare function addStockToItems(items: WatchlistEntry[], symbol: string): WatchlistEntry[];
/**
 * Add a stock to the watchlist at a specific index
 */
export declare function addStockAtIndex(items: WatchlistEntry[], stock: WatchlistStock, index: number): WatchlistEntry[];
/**
 * Add a header to the watchlist
 */
export declare function addHeaderToItems(items: WatchlistEntry[], text: string): WatchlistEntry[];
/**
 * Add a header to the watchlist at a specific index
 */
export declare function addHeaderAtIndex(items: WatchlistEntry[], text: string, index: number): WatchlistEntry[];
/**
 * Remove an item from the watchlist
 */
export declare function removeItemFromList(items: WatchlistEntry[], index: number): WatchlistEntry[];
/**
 * Convert items array back to symbols array (for APIs that need it)
 */
export declare function itemsToSymbols(items: WatchlistEntry[]): string[];
/**
 * Generate a unique ID for headers
 */
export declare function generateHeaderId(): string;
