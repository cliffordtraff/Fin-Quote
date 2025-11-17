import { WatchlistEntry, WatchlistTab, WatchlistStock, WatchlistHeader } from '@watchlist/types'

/**
 * Migrate old format (symbols array) to new format (items array)
 */
export function migrateWatchlistTab(tab: WatchlistTab): WatchlistTab {
  // If already migrated, return as-is
  if (tab.items) {
    return tab
  }
  
  // Migrate from symbols to items
  const items: WatchlistEntry[] = (tab.symbols || []).map(symbol => ({
    type: 'stock' as const,
    symbol
  }))
  
  return {
    ...tab,
    items,
    symbols: undefined  // Remove deprecated field
  }
}

/**
 * Get all stock symbols from a watchlist tab (excludes headers)
 */
export function getStockSymbols(tab: WatchlistTab): string[] {
  // Handle old format
  if (!tab.items && tab.symbols) {
    return tab.symbols
  }
  
  // Filter items to get only stocks
  return (tab.items || [])
    .filter(item => item.type === 'stock')
    .map(item => item.symbol)
}

/**
 * Get all items as a flat array (for backward compatibility)
 */
export function getAllSymbols(tab: WatchlistTab): string[] {
  // Handle old format
  if (!tab.items && tab.symbols) {
    return tab.symbols
  }
  
  // Return all symbols (including header text)
  return (tab.items || []).map(item => item.symbol)
}

/**
 * Check if an item is a stock
 */
export function isStock(item: WatchlistEntry): item is WatchlistStock {
  return item.type === 'stock'
}

/**
 * Check if an item is a header
 */
export function isHeader(item: WatchlistEntry): item is WatchlistHeader {
  return item.type === 'header'
}

/**
 * Add a stock to the watchlist
 */
export function addStockToItems(items: WatchlistEntry[], symbol: string): WatchlistEntry[] {
  // Check if already exists
  const exists = items.some(item => item.type === 'stock' && item.symbol === symbol)
  if (exists) return items

  return [...items, { type: 'stock', symbol }]
}

/**
 * Add a stock to the watchlist at a specific index
 */
export function addStockAtIndex(items: WatchlistEntry[], stock: WatchlistStock, index: number): WatchlistEntry[] {
  // Check if already exists
  const exists = items.some(item => item.type === 'stock' && item.symbol === stock.symbol)
  if (exists) return items

  const newItems = [...items]
  newItems.splice(index, 0, stock)
  return newItems
}

/**
 * Add a header to the watchlist
 */
export function addHeaderToItems(items: WatchlistEntry[], text: string): WatchlistEntry[] {
  return [...items, { type: 'header', symbol: text }]
}

/**
 * Add a header to the watchlist at a specific index
 */
export function addHeaderAtIndex(items: WatchlistEntry[], text: string, index: number): WatchlistEntry[] {
  const newItems = [...items]
  newItems.splice(index, 0, { type: 'header', symbol: text })
  return newItems
}

/**
 * Remove an item from the watchlist
 */
export function removeItemFromList(items: WatchlistEntry[], index: number): WatchlistEntry[] {
  return items.filter((_, i) => i !== index)
}

/**
 * Convert items array back to symbols array (for APIs that need it)
 */
export function itemsToSymbols(items: WatchlistEntry[]): string[] {
  return items
    .filter(item => item.type === 'stock')
    .map(item => item.symbol)
}

/**
 * Generate a unique ID for headers
 */
export function generateHeaderId(): string {
  return `header_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}