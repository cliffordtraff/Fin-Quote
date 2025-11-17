import { useState, useEffect, useCallback } from 'react'
import { CandlestickData, Timeframe } from '@watchlist/types/chart'

interface UseChartDataReturn {
  data: CandlestickData[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch and manage chart data for a symbol
 *
 * @param symbol - Stock symbol to fetch data for
 * @param timeframe - Chart timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)
 * @param enabled - Whether to fetch data (default: true)
 */
export function useChartData(
  symbol: string,
  timeframe: Timeframe = '15m',
  enabled: boolean = true
): UseChartDataReturn {
  const [data, setData] = useState<CandlestickData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    if (!symbol || !enabled) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/stocks/chart-data?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
        {
          cache: 'default', // Allow browser caching
        }
      )

      const text = await response.text()
      let result: any = {}
      try {
        result = text ? JSON.parse(text) : {}
      } catch (parseErr) {
        console.warn('[watchlist] Chart data returned non-JSON payload', parseErr)
      }

      if (!response.ok) {
        throw new Error(result?.error || `Failed to fetch chart data: ${response.statusText}`)
      }

      if (result.data && Array.isArray(result.data)) {
        setData(result.data)
      } else {
        throw new Error('Invalid chart data format received')
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error fetching chart data')
      setError(error)
      console.error('Chart data fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [symbol, timeframe, enabled])

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}
