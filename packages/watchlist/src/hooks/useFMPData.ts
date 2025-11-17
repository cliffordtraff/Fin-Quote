import { useState, useEffect, useCallback, useRef } from 'react'
import { Stock, UnifiedStockResponse } from '@watchlist/types'
import { getPollingInterval, shouldPollAsset, getMarketStatus, formatMarketStatus } from '@watchlist/utils/marketHours'
import { cache } from '@watchlist/utils/localStorage-cache'
import { getSmartCacheTTL } from '@watchlist/utils/market-time'

interface UseFMPDataOptions {
  symbols: string[]
  visibleSymbols?: string[] // Optional: symbols currently visible in viewport
  pollInterval?: number // milliseconds (optional override)
  enabled?: boolean
}

export function useFMPData({ 
  symbols, 
  visibleSymbols, // New optional parameter
  pollInterval,
  enabled = true 
}: UseFMPDataOptions) {
  // Initialize with cached data for instant display (STALE-WHILE-REVALIDATE)
  const [stockData, setStockData] = useState<Map<string, Stock>>(() => {
    if (!enabled || symbols.length === 0) return new Map()

    // Check per-symbol cache for instant display
    const cachedData = new Map<string, Stock>()
    let freshCount = 0
    let staleCount = 0

    symbols.forEach(symbol => {
      const symbolKey = `stocks:quote:${symbol}`

      // First try fresh cache
      const fresh = cache.get<Stock>(symbolKey, 30000)
      if (fresh) {
        cachedData.set(symbol, fresh)
        freshCount++
        return
      }

      // If no fresh cache, try stale cache (expired but still useful)
      const stale = cache.getStale<Stock>(symbolKey)
      if (stale) {
        cachedData.set(symbol, stale.data)
        staleCount++
      }
    })

    return cachedData
  })
  
  // If we have cached data, we're not "loading"
  const [isLoading, setIsLoading] = useState(() => stockData.size === 0)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [marketStatus, setMarketStatus] = useState(getMarketStatus())
  const [dataSource, setDataSource] = useState<'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed'>('live')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousSymbolsRef = useRef<string[]>([])
  const previousVisibleSymbolsRef = useRef<string[]>([])
  const hasLoadedInitialRef = useRef<boolean>(false)
  const backgroundFetchRef = useRef<NodeJS.Timeout | null>(null)

  // Update market status every minute
  useEffect(() => {
    const updateStatus = () => {
      const status = getMarketStatus()
      setMarketStatus(status)
    }
    
    updateStatus()
    const statusInterval = setInterval(updateStatus, 60000) // Check every minute
    
    return () => clearInterval(statusInterval)
  }, [])

  // Determine which symbols should be polled
  const getActiveSymbols = useCallback(() => {
    // If visibleSymbols provided, use those (filtered by market hours)
    const baseSymbols = visibleSymbols || symbols
    return baseSymbols.filter(symbol => shouldPollAsset(symbol))
  }, [symbols, visibleSymbols])

  // Fetch dividends in background (non-blocking)
  const fetchDividendsInBackground = useCallback(async (symbolsToFetch: string[], skipCache: boolean = false) => {
    if (!enabled || symbolsToFetch.length === 0) return

    const skipCacheParam = skipCache ? '&skipCache=true' : ''
    try {
      const response = await fetch(`/api/stocks/data?symbols=${symbolsToFetch.join(',')}&include=dividends${skipCacheParam}`)

      if (!response.ok) {
        console.warn('[Telemetry] Background dividend fetch failed:', response.statusText)
        return
      }

      const result: UnifiedStockResponse = await response.json()

      // Merge dividend data into existing stock data
      if (result.data.dividends && Object.keys(result.data.dividends).length > 0) {
        setStockData(prevData => {
          const updatedData = new Map(prevData)
          Object.entries(result.data.dividends!).forEach(([symbol, dividend]) => {
            const stock = updatedData.get(symbol)
            if (stock) {
              stock.dividendYield = dividend.dividendYield
              stock.exDividendDate = dividend.exDividendDate
              updatedData.set(symbol, stock)
            }
          })
          return updatedData
        })
      }
    } catch (err: any) {
      console.warn('[Telemetry] Background dividend fetch error (non-critical):', err.message)
    }
  }, [enabled])

  // Fetch stock data
  const fetchStockData = useCallback(async (isInitialFetch = false) => {
    if (!enabled || symbols.length === 0) {
      setIsLoading(false)
      return
    }

    // For initial fetch:
    // - If <= initialBatchSize symbols, fetch all (no optimization needed)
    // - If > initialBatchSize symbols and visibleSymbols available, use those
    // - Otherwise use adaptive batch size based on list size (30 for large lists, 50 for normal)
    // For polling, only get active symbols
    const initialBatchSize = symbols.length > 500 ? 30 : 50
    const symbolsToFetch = isInitialFetch
      ? (symbols.length <= initialBatchSize ? symbols :
         (visibleSymbols?.length > 0 ? visibleSymbols : symbols.slice(0, initialBatchSize)))
      : getActiveSymbols()

    // Performance tracking for initial fetch
    if (isInitialFetch) {
      performance.mark('watchlist-initial-fetch-start')
    }

    if (symbolsToFetch.length === 0 && !isInitialFetch) {
      setIsLoading(false)
      return
    }

    const startTime = Date.now()

    try {
      // Fetch ONLY quotes first for fast initial load
      // Dividends will be fetched separately in background
      // Use skipCache on initial fetch to bypass stale Firestore cache
      const skipCacheParam = isInitialFetch ? '&skipCache=true' : ''
      const response = await fetch(`/api/stocks/data?symbols=${symbolsToFetch.join(',')}&include=quotes${skipCacheParam}`)
      
      if (!response.ok) {
        // Parse error response
        let errorData: any = null
        try {
          errorData = await response.json()
        } catch {
          // If we can't parse JSON, create a generic error
          errorData = {
            error: {
              type: 'API_ERROR',
              message: `Failed to fetch stock data: ${response.statusText}`,
              timestamp: new Date().toISOString()
            }
          }
        }
        
        // Set error state
        setError(errorData.error?.message || 'Failed to fetch stock data')
        setDataSource('error')
        setIsLoading(false)
        
        // If retryable error with retryAfter, schedule retry
        if (errorData.error?.retryAfter && errorData.error.retryAfter > 0) {
          console.log(`Scheduling retry after ${errorData.error.retryAfter} seconds`)
          setTimeout(() => {
            setError(null) // Clear error before retry
            fetchStockData(false)
          }, errorData.error.retryAfter * 1000)
        }
        
        return
      }

      const result: UnifiedStockResponse = await response.json()
      
      // TELEMETRY: Track response time
      const endTime = Date.now()

      // Performance tracking for initial fetch
      if (isInitialFetch) {
        performance.mark('watchlist-initial-fetch-end')
        performance.measure('watchlist-initial-load', 'watchlist-initial-fetch-start', 'watchlist-initial-fetch-end')

        const measure = performance.getEntriesByName('watchlist-initial-load')[0] as PerformanceMeasure
        if (measure) {
        }
      }
      
      // Check if result has an error (for backward compatibility)
      if ('error' in result) {
        setError((result as any).error?.message || 'Failed to fetch stock data')
        setDataSource('error')
        setIsLoading(false)
        return
      }
      
      // Clear any previous errors on successful fetch
      setError(null)
      
      // Update data source and metadata
      setDataSource(result.status.source)
      setLastUpdated(result.status.timestamp)
      
      // Handle any warnings or errors from the API
      if (result.status.warnings.length > 0) {
        console.warn('API warnings:', result.status.warnings)
      }
      
      if (result.status.errors.length > 0) {
        console.error('API errors:', result.status.errors)
        // Don't throw, we might have partial data
      }
      
      // Only update if we got quote data back
      if (result.data.quotes && Object.keys(result.data.quotes).length > 0) {
        if (isInitialFetch) {
          // On initial fetch, replace all data (quotes only, dividends loaded separately)
          const newStockData = new Map<string, Stock>()
          Object.entries(result.data.quotes).forEach(([symbol, stock]) => {
            newStockData.set(symbol, stock)
          })
          setStockData(newStockData)

          // Save to cache with smart TTL (per-symbol for better cache reuse)
          if (newStockData.size > 0) {
            newStockData.forEach((stock, symbol) => {
              const symbolKey = `stocks:quote:${symbol}`
              const smartTTL = getSmartCacheTTL([symbol], 30000) // 30s baseline
              cache.set(symbolKey, stock, smartTTL)
            })
          }
        } else {
          // On poll updates, merge with existing data (important for weekends)
          setStockData(prevData => {
            const updatedData = new Map(prevData)
            Object.entries(result.data.quotes!).forEach(([symbol, stock]) => {
              // Preserve existing dividend data from previous loads
              const existing = prevData.get(symbol)
              if (existing?.dividendYield !== undefined) {
                stock.dividendYield = existing.dividendYield
                stock.exDividendDate = existing.exDividendDate
              }
              updatedData.set(symbol, stock)
            })

            // Cache the updated data with smart TTL (per-symbol for better cache reuse)
            if (updatedData.size > 0) {
              updatedData.forEach((stock, symbol) => {
                const symbolKey = `stocks:quote:${symbol}`
                const smartTTL = getSmartCacheTTL([symbol], 30000) // 30s baseline
                cache.set(symbolKey, stock, smartTTL)
              })
            }

            return updatedData
          })
        }
      } else if (isInitialFetch) {
        // On initial fetch with no data, set empty map
        setStockData(new Map())
      }
      
      // If not initial fetch and no data, keep existing data unchanged
      setIsConnected(result.status.source !== 'mock')
      setError(null)
      
      // Mark initial load as complete and schedule background fetches
      if (isInitialFetch) {
        hasLoadedInitialRef.current = true

        // IMMEDIATELY fetch dividends in background (non-blocking)
        // Use skipCache=true on initial load to bypass stale Firestore cache
        fetchDividendsInBackground(symbols, true)

        // If we only fetched visible symbols, schedule progressive background fetch for the rest
        if (symbolsToFetch.length < symbols.length && symbols.length > initialBatchSize) {
          // Clear any existing background fetch
          if (backgroundFetchRef.current) {
            clearTimeout(backgroundFetchRef.current)
          }

          // Minimal delay for background fetch - active tab already has data
          const backgroundDelay = 100 // Reduced from 500-2000ms to 100ms

          // Schedule progressive background fetch for remaining symbols
          backgroundFetchRef.current = setTimeout(async () => {
            const remainingSymbols = symbols.filter(s => !symbolsToFetch.includes(s))
            const chunkSize = 100  // Fetch in chunks to avoid API rate limits

            // Progressive fetch with error handling
            for (let i = 0; i < remainingSymbols.length; i += chunkSize) {
              const chunk = remainingSymbols.slice(i, i + chunkSize)

              try {

                const response = await fetch(`/api/stocks/data?symbols=${chunk.join(',')}&include=quotes,dividends`)

                if (response.ok) {
                  const result = await response.json()
                  if (result.data.quotes && Object.keys(result.data.quotes).length > 0) {
                    setStockData(prevData => {
                      const updatedData = new Map(prevData)
                      Object.entries(result.data.quotes).forEach(([symbol, stock]: [string, any]) => {
                        if (result.data.dividends?.[symbol]) {
                          stock.dividendYield = result.data.dividends[symbol].dividendYield
                          stock.exDividendDate = result.data.dividends[symbol].exDividendDate
                        }
                        updatedData.set(symbol, stock)
                      })
                      return updatedData
                    })
                  }
                }

                // Minimal delay between chunks (reduced from 500ms to 100ms)
                if (i + chunkSize < remainingSymbols.length) {
                  await new Promise(resolve => setTimeout(resolve, 100))
                }
              } catch (err: any) {
                console.warn(`[Telemetry] Background chunk failed (non-critical):`, err.message)
                // Continue with next chunk even if one fails
              }
            }

          }, backgroundDelay)
        }
      }
    } catch (err) {
      console.error('Error fetching stock data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch stock data')
      setIsConnected(false)
    } finally {
      setIsLoading(false)
    }
  }, [symbols, enabled, getActiveSymbols])

  // Subscribe to WebSocket updates (via REST endpoint for now)
  const subscribe = useCallback(async () => {
    if (!enabled || symbols.length === 0) return

    // WebSocket disabled for now due to server-side issues
    // TODO: Re-enable when WebSocket is fixed
    return
    
    // try {
    //   const response = await fetch(`/api/ws?symbols=${symbols.join(',')}`)
    //   
    //   if (!response.ok) {
    //     throw new Error(`Failed to subscribe: ${response.statusText}`)
    //   }

    //   const data = await response.json()
    //   
    //   // Update with initial data
    //   if (data.data) {
    //     const newStockData = new Map<string, Stock>()
    //     Object.entries(data.data).forEach(([symbol, stock]) => {
    //       newStockData.set(symbol, stock as Stock)
    //     })
    //     setStockData(newStockData)
    //   }
    // } catch (err) {
    //   console.error('Error subscribing to symbols:', err)
    // }
  }, [symbols, enabled])

  // Unsubscribe from updates
  const unsubscribe = useCallback(async (symbolsToUnsubscribe: string[]) => {
    if (symbolsToUnsubscribe.length === 0) return

    // WebSocket disabled for now due to server-side issues
    // TODO: Re-enable when WebSocket is fixed
    return
    
    // try {
    //   const response = await fetch(
    //     `/api/ws?symbols=${symbolsToUnsubscribe.join(',')}`,
    //     { method: 'DELETE' }
    //   )
    //   
    //   if (!response.ok) {
    //     throw new Error(`Failed to unsubscribe: ${response.statusText}`)
    //   }

    // } catch (err) {
    //   console.error('Error unsubscribing from symbols:', err)
    // }
  }, [])

  // Set up polling and subscriptions
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    // Check if symbols have changed
    const symbolsChanged = 
      symbols.length !== previousSymbolsRef.current.length ||
      symbols.some(s => !previousSymbolsRef.current.includes(s))

    if (symbolsChanged) {
      // Unsubscribe from old symbols
      const oldSymbols = previousSymbolsRef.current.filter(s => !symbols.includes(s))
      if (oldSymbols.length > 0) {
        unsubscribe(oldSymbols)
      }

      // Subscribe to new symbols
      subscribe()
      previousSymbolsRef.current = [...symbols]
      
      // Only fetch when symbols actually change (not on every render)
      fetchStockData(true)
    }

    // Determine smart polling interval
    const smartInterval = pollInterval || getPollingInterval(symbols)

    // Set up polling interval only if market is open for some symbols
    if (smartInterval > 0) {
      intervalRef.current = setInterval(() => fetchStockData(false), smartInterval)
    } else {
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [symbols, pollInterval, enabled, fetchStockData, subscribe, unsubscribe])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (previousSymbolsRef.current.length > 0) {
        unsubscribe(previousSymbolsRef.current)
      }
      // Clean up background fetch timeout
      if (backgroundFetchRef.current) {
        clearTimeout(backgroundFetchRef.current)
      }
    }
  }, [unsubscribe])

  // PRIORITY FETCH: When visibleSymbols changes, immediately fetch those symbols
  // This ensures rows on screen get data ASAP, even if they're not in the initial batch
  useEffect(() => {
    if (!enabled || !visibleSymbols || visibleSymbols.length === 0) return
    if (!hasLoadedInitialRef.current) return // Wait for initial load to complete

    // Check if visibleSymbols actually changed
    const visibleChanged =
      visibleSymbols.length !== previousVisibleSymbolsRef.current.length ||
      visibleSymbols.some(s => !previousVisibleSymbolsRef.current.includes(s))

    if (!visibleChanged) return

    // Find symbols that are visible but not yet loaded
    const missingVisibleSymbols = visibleSymbols.filter(symbol => !stockData.has(symbol))

    if (missingVisibleSymbols.length > 0) {

      // Trigger immediate fetch for missing visible symbols (non-blocking)
      fetch(`/api/stocks/data?symbols=${missingVisibleSymbols.join(',')}&include=quotes,dividends`)
        .then(res => res.json())
        .then((result: UnifiedStockResponse) => {
          if (result.data.quotes && Object.keys(result.data.quotes).length > 0) {
            setStockData(prevData => {
              const updatedData = new Map(prevData)
              Object.entries(result.data.quotes!).forEach(([symbol, stock]) => {
                // Merge dividend data if available
                if (result.data.dividends?.[symbol]) {
                  stock.dividendYield = result.data.dividends[symbol].dividendYield
                  stock.exDividendDate = result.data.dividends[symbol].exDividendDate
                }
                updatedData.set(symbol, stock)
              })
              return updatedData
            })
          }
        })
        .catch(err => console.warn('[Telemetry] Priority fetch failed (non-critical):', err))
    }

    previousVisibleSymbolsRef.current = [...visibleSymbols]
  }, [visibleSymbols, enabled, stockData, hasLoadedInitialRef])

  // Dividend data is now fetched with the initial request, no separate fetch needed

  // Refresh data manually
  const refresh = useCallback(() => {
    fetchStockData()
  }, [fetchStockData])

  return {
    stockData,
    isLoading,
    error,
    isConnected,
    marketStatus,
    dataSource,
    lastUpdated,
    refresh
  }
}