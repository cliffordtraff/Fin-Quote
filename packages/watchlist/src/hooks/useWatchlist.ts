'use client'

import { useState, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { WatchlistTab, WatchlistEntry, WatchlistStock } from '@watchlist/types'
import { useAuth } from '@watchlist/lib/firebase/auth-context'
import { WatchlistService } from '@watchlist/lib/firebase/watchlist-service'
import {
  migrateWatchlistTab,
  getStockSymbols,
  addStockToItems,
  addHeaderToItems,
  addHeaderAtIndex,
  addStockAtIndex,
  removeItemFromList
} from '@watchlist/utils/watchlist-helpers'
import { cache } from '@watchlist/utils/localStorage-cache'
import { migrateWatchlistWithTvSymbols } from '@watchlist/utils/watchlist-migration'

const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BTC-USD']
const DEFAULT_ITEMS: WatchlistEntry[] = DEFAULT_SYMBOLS.map(symbol => ({ type: 'stock', symbol }))

export function useWatchlist() {
  const { user } = useAuth()

  // Initialize with cached watchlist for instant display
  const [tabs, setTabs] = useState<WatchlistTab[]>(() => {
    // For authenticated users, try localStorage cache
    if (user) {
      const cacheKey = `watchlist:${user.uid}`
      const cached = cache.get<WatchlistTab[]>(
        cacheKey,
        5 * 60 * 1000 // 5 minutes for watchlist structure
      )

      if (cached) {
        return cached
      }
      return []
    }

    // For unauthenticated users, try sessionStorage
    try {
      const sessionData = sessionStorage.getItem('watchlist:session')
      if (sessionData) {
        const parsed = JSON.parse(sessionData)
        return parsed
      }
    } catch (err) {
      console.error('Failed to load from sessionStorage:', err)
    }

    // Default for new unauthenticated users
    return [{ name: 'Watchlist 1', items: DEFAULT_ITEMS }]
  })

  const [activeTabIndex, setActiveTabIndex] = useState(() => {
    // For authenticated users, try cache
    if (user) {
      const cacheKey = `watchlist:activeTab:${user.uid}`
      const cached = cache.get<number>(
        cacheKey,
        5 * 60 * 1000 // 5 minutes
      )
      return cached !== null ? cached : 0
    }

    // For unauthenticated users, try sessionStorage
    try {
      const sessionData = sessionStorage.getItem('watchlist:activeTab:session')
      if (sessionData) {
        return parseInt(sessionData, 10)
      }
    } catch (err) {
      console.error('Failed to load activeTab from sessionStorage:', err)
    }

    return 0
  })
  // If we have cached data, we're not "loading"
  const [isLoading, setIsLoading] = useState(() => tabs.length === 0)
  const [isSaving, setIsSaving] = useState(false)
  const [watchlistService, setWatchlistService] = useState<WatchlistService | null>(null)

  // Initialize watchlist service when user is available
  useEffect(() => {
    if (user) {
      setWatchlistService(new WatchlistService(user.uid))
      // Clear sessionStorage when user signs in
      try {
        sessionStorage.removeItem('watchlist:session')
        sessionStorage.removeItem('watchlist:activeTab:session')
      } catch (err) {
        console.error('Failed to clear sessionStorage:', err)
      }
    } else {
      setWatchlistService(null)
    }
  }, [user])

  // Load watchlist from Firestore (authenticated) or just set loading to false (unauthenticated)
  useEffect(() => {
    const loadWatchlist = async () => {
      // For unauthenticated users, just mark as loaded
      if (!user) {
        setIsLoading(false)
        return
      }

      if (!watchlistService) {
        setIsLoading(false)
        return
      }

      try {
        // First, check if we should migrate localStorage data
        const migrated = await watchlistService.migrateFromLocalStorage()

        // Load from Firestore
        const watchlistData = await watchlistService.getWatchlist()

        if (watchlistData && watchlistData.tabs.length > 0) {
          // Migrate tabs to new format if needed
          let migratedTabs = watchlistData.tabs.map(migrateWatchlistTab)

          // Also migrate to add tvSymbol to existing entries
          const { tabs: tvMigratedTabs, migrated } = migrateWatchlistWithTvSymbols(migratedTabs)
          if (migrated) {
            migratedTabs = tvMigratedTabs
            // Save the migrated data back to Firestore
            if (user) {
              await watchlistService.saveWatchlist(migratedTabs, watchlistData.activeTabIndex)
            }
          }

          setTabs(migratedTabs)
          setActiveTabIndex(watchlistData.activeTabIndex)

          // Cache the loaded data
          if (user) {
            cache.set(`watchlist:${user.uid}`, migratedTabs)
            cache.set(`watchlist:activeTab:${user.uid}`, watchlistData.activeTabIndex)
          }
        } else {
          // No data in Firestore, create default
          const defaultTabs = [{ name: 'Watchlist 1', items: DEFAULT_ITEMS }]
          setTabs(defaultTabs)
          setActiveTabIndex(0)

          // Save default to Firestore
          await watchlistService.saveWatchlist(defaultTabs, 0)
        }
      } catch (error) {
        console.error('Error loading watchlist:', error)
        // Fall back to defaults on error
        setTabs([{ name: 'Watchlist 1', symbols: DEFAULT_SYMBOLS }])
        setActiveTabIndex(0)
      } finally {
        setIsLoading(false)
      }
    }

    loadWatchlist()
  }, [watchlistService, user])

  // Save tabs to Firestore and cache (authenticated) or sessionStorage (unauthenticated)
  const saveTabs = useCallback(async (newTabs: WatchlistTab[]) => {
    setTabs(newTabs)

    if (user) {
      // Authenticated: save to cache + Firestore
      const cacheKey = `watchlist:${user.uid}`
      cache.set(cacheKey, newTabs)

      if (watchlistService) {
        setIsSaving(true)
        try {
          await watchlistService.updateTabs(newTabs)
        } catch (error) {
          console.error('Error saving tabs:', error)
        } finally {
          setIsSaving(false)
        }
      }
    } else {
      // Unauthenticated: save to sessionStorage only
      try {
        sessionStorage.setItem('watchlist:session', JSON.stringify(newTabs))
      } catch (err) {
        console.error('Failed to save to sessionStorage:', err)
      }
    }
  }, [watchlistService, user])

  // Save active tab index to Firestore and cache (authenticated) or sessionStorage (unauthenticated)
  const saveActiveTabIndex = useCallback(async (index: number) => {
    setActiveTabIndex(index)

    if (user) {
      // Authenticated: save to cache + Firestore
      const cacheKey = `watchlist:activeTab:${user.uid}`
      cache.set(cacheKey, index)

      if (watchlistService) {
        try {
          await watchlistService.updateActiveTabIndex(index)
        } catch (error) {
          console.error('Error saving active tab index:', error)
        }
      }
    } else {
      // Unauthenticated: save to sessionStorage only
      try {
        sessionStorage.setItem('watchlist:activeTab:session', index.toString())
      } catch (err) {
        console.error('Failed to save activeTab to sessionStorage:', err)
      }
    }
  }, [watchlistService, user])

  // Add symbol to current tab (supports both string and full metadata)
  const addSymbol = useCallback((symbolOrData: string | { 
    symbol: string; 
    tvSymbol?: string; 
    exchange?: string; 
    companyName?: string;
    isADR?: boolean;
  }) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])
    
    // Handle both string and object input
    const symbol = typeof symbolOrData === 'string' ? symbolOrData.toUpperCase() : symbolOrData.symbol.toUpperCase()
    
    // Check if symbol already exists (check both symbol and tvSymbol for proper duplicate detection)
    const tvSymbol = typeof symbolOrData === 'object' ? symbolOrData.tvSymbol : undefined
    const exists = (currentTab.items || []).some(
      item => {
        if (item.type !== 'stock') return false
        const stock = item as WatchlistStock
        // Check against base symbol and tvSymbol
        if (stock.symbol.toUpperCase() === symbol) return true
        // If we have tvSymbol, check that too
        if (tvSymbol && stock.tvSymbol === tvSymbol) return true
        return false
      }
    )
    
    if (!exists) {
      if (typeof symbolOrData === 'string') {
        // Legacy: just symbol string
        currentTab.items = addStockToItems(currentTab.items || [], symbol)
      } else {
        // New: full metadata from search
        const newStock: WatchlistStock = {
          type: 'stock',
          symbol: symbolOrData.symbol.toUpperCase(),
          tvSymbol: symbolOrData.tvSymbol,
          exchange: symbolOrData.exchange,
          companyName: symbolOrData.companyName,
          isADR: symbolOrData.isADR
        }
        currentTab.items = [...(currentTab.items || []), newStock]
      }
      newTabs[activeTabIndex] = currentTab
      saveTabs(newTabs)
    }
  }, [tabs, activeTabIndex, saveTabs])

  // Remove symbol from current tab
  const removeSymbol = useCallback((symbol: string) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])
    
    const itemIndex = (currentTab.items || []).findIndex(
      item => item.symbol === symbol
    )
    
    if (itemIndex !== -1) {
      currentTab.items = removeItemFromList(currentTab.items || [], itemIndex)
      newTabs[activeTabIndex] = currentTab
      // saveTabs already calls setTabs internally
      saveTabs(newTabs)
    }
  }, [tabs, activeTabIndex, saveTabs])

  // Remove multiple symbols
  const removeSymbols = useCallback((symbols: string[]) => {
    // Use flushSync to batch updates and prevent flicker
    flushSync(() => {
      const newTabs = [...tabs]
      const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])

      currentTab.items = (currentTab.items || []).filter(
        item => !symbols.includes(item.symbol)
      )

      newTabs[activeTabIndex] = currentTab
      setTabs(newTabs)  // Update state immediately
    })

    // Then save to Firestore/sessionStorage asynchronously
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])
    currentTab.items = (currentTab.items || []).filter(
      item => !symbols.includes(item.symbol)
    )
    newTabs[activeTabIndex] = currentTab

    if (user) {
      // Authenticated: save to cache and Firestore
      const cacheKey = `watchlist:${user.uid}`
      cache.set(cacheKey, newTabs)

      if (watchlistService) {
        setIsSaving(true)
        watchlistService.updateTabs(newTabs).finally(() => {
          setIsSaving(false)
        })
      }
    } else {
      // Unauthenticated: save to sessionStorage
      try {
        sessionStorage.setItem('watchlist:session', JSON.stringify(newTabs))
      } catch (err) {
        console.error('Failed to save to sessionStorage:', err)
      }
    }
  }, [tabs, activeTabIndex, user, watchlistService])

  // Reorder items in current tab (handles both reordering and type changes)
  const reorderSymbols = useCallback((newSymbols: string[]) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])
    const currentItems = currentTab.items || []
    
    // Build new items array preserving headers and reordering stocks
    const itemMap = new Map<string, WatchlistEntry>()
    currentItems.forEach(item => itemMap.set(item.symbol, item))
    
    // Create new items array based on newSymbols order
    const newItems: WatchlistEntry[] = []
    newSymbols.forEach(symbol => {
      const item = itemMap.get(symbol)
      if (item) {
        newItems.push(item)
      } else {
        // Fallback: create stock item if not found
        newItems.push({ type: 'stock', symbol })
      }
    })
    
    currentTab.items = newItems
    newTabs[activeTabIndex] = currentTab
    saveTabs(newTabs)
  }, [tabs, activeTabIndex, saveTabs])
  
  // Add header to current tab
  const addHeader = useCallback((text: string) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])

    currentTab.items = addHeaderToItems(currentTab.items || [], text)
    newTabs[activeTabIndex] = currentTab
    saveTabs(newTabs)
  }, [tabs, activeTabIndex, saveTabs])

  // Add header at specific index
  const addHeaderRow = useCallback((text: string, index: number) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])

    currentTab.items = addHeaderAtIndex(currentTab.items || [], text, index)
    newTabs[activeTabIndex] = currentTab
    saveTabs(newTabs)
  }, [tabs, activeTabIndex, saveTabs])

  // Add stock at specific index
  const addStockRow = useCallback((stockData: {
    symbol: string
    tvSymbol?: string
    exchange?: string
    companyName?: string
    isADR?: boolean
  }, index: number) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])

    const newStock: WatchlistStock = {
      type: 'stock',
      symbol: stockData.symbol.toUpperCase(),
      tvSymbol: stockData.tvSymbol,
      exchange: stockData.exchange,
      companyName: stockData.companyName,
      isADR: stockData.isADR
    }

    currentTab.items = addStockAtIndex(currentTab.items || [], newStock, index)
    newTabs[activeTabIndex] = currentTab
    saveTabs(newTabs)
  }, [tabs, activeTabIndex, saveTabs])
  
  // Rename header
  const renameHeader = useCallback((oldName: string, newName: string) => {
    const newTabs = [...tabs]
    const currentTab = migrateWatchlistTab(newTabs[activeTabIndex])
    
    currentTab.items = (currentTab.items || []).map(item => 
      item.type === 'header' && item.symbol === oldName 
        ? { ...item, symbol: newName }
        : item
    )
    
    newTabs[activeTabIndex] = currentTab
    saveTabs(newTabs)
  }, [tabs, activeTabIndex, saveTabs])

  return {
    tabs,
    activeTabIndex,
    isLoading,
    isSaving,
    setTabs: saveTabs,
    setActiveTabIndex: saveActiveTabIndex,
    addSymbol,
    addHeader,
    addHeaderRow,
    addStockRow,
    renameHeader,
    removeSymbol,
    removeSymbols,
    reorderSymbols,
    currentTab: tabs[activeTabIndex],
  }
}