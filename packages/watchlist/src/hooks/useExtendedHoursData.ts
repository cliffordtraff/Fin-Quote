import { useState, useEffect, useCallback, useRef } from 'react'
import { ExtendedHoursQuote } from '@watchlist/types'
import { isExtendedHours } from '@watchlist/utils/market-hours'
import { normalizeSymbol } from '@watchlist/utils/symbolNormalizer'

interface UseExtendedHoursDataResult {
  data: Map<string, ExtendedHoursQuote>
  isLoading: boolean
  error: string | null
}

/**
 * Hook to fetch extended hours data for symbols
 * Only fetches when enabled and during extended hours sessions
 * Polls every 1 minute during extended hours
 */
export function useExtendedHoursData(
  symbols: string[],
  enabled: boolean
): UseExtendedHoursDataResult {
  const [data, setData] = useState<Map<string, ExtendedHoursQuote>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchExtendedHoursData = useCallback(async () => {
    if (!enabled || symbols.length === 0) {
      setData(new Map())
      return
    }

    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(
        `/api/stocks/extended-hours?symbols=${symbols.join(',')}`,
        { signal: abortControllerRef.current.signal }
      )

      // Handle 404 gracefully - no extended hours data available
      if (response.status === 404) {
        return
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()

      if (result.data) {
        const newData = new Map<string, ExtendedHoursQuote>()
        Object.entries(result.data).forEach(([symbol, quote]) => {
          const quoteData = quote as ExtendedHoursQuote
          const normalizedFromQuote = normalizeSymbol(
            quoteData.symbol?.split(':').pop() || quoteData.symbol || symbol
          )
          const normalizedFromKey = normalizeSymbol(symbol)

          newData.set(normalizedFromQuote, quoteData)
          if (normalizedFromKey !== normalizedFromQuote) {
            newData.set(normalizedFromKey, quoteData)
          }
          // Also store the raw key for fallback lookups
          newData.set(symbol, quoteData)
        })
        setData(newData)
      } else {
        setData(new Map())
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }

      console.error('Error fetching extended hours data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [symbols, enabled])

  useEffect(() => {
    if (!enabled) {
      setData(new Map())
      return
    }

    // Initial fetch
    fetchExtendedHoursData()

    // Poll every 1 minute (60000ms) - fetch extended hours data regardless of time
    // This will show the last extended hours close price (8 PM ET)
    const interval = setInterval(() => {
      fetchExtendedHoursData()
    }, 60000)

    return () => {
      clearInterval(interval)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [enabled, fetchExtendedHoursData])

  return { data, isLoading, error }
}
