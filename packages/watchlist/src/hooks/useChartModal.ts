import { useState, useCallback } from 'react'
import { Timeframe } from '@watchlist/types/chart'

interface UseChartModalReturn {
  isOpen: boolean
  symbol: string | null
  timeframe: Timeframe
  openChart: (symbol: string, timeframe?: Timeframe) => void
  closeChart: () => void
  setTimeframe: (timeframe: Timeframe) => void
}

/**
 * Hook to manage chart modal state
 *
 * Provides functions to open/close the chart modal and manage selected symbol
 */
export function useChartModal(): UseChartModalReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [symbol, setSymbol] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1d')

  const openChart = useCallback((newSymbol: string, newTimeframe: Timeframe = '1d') => {
    setSymbol(newSymbol)
    setTimeframe(newTimeframe)
    setIsOpen(true)
  }, [])

  const closeChart = useCallback(() => {
    setIsOpen(false)
    // Don't clear symbol immediately to avoid flash during close animation
    setTimeout(() => setSymbol(null), 300)
  }, [])

  const updateTimeframe = useCallback((newTimeframe: Timeframe) => {
    setTimeframe(newTimeframe)
  }, [])

  return {
    isOpen,
    symbol,
    timeframe,
    openChart,
    closeChart,
    setTimeframe: updateTimeframe
  }
}