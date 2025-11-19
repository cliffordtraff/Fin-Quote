'use client'

import { useState, useEffect } from 'react'
import { ThemeProvider } from '@fin/watchlist/src/components/ThemeProvider'
import { TradingViewChart } from '@fin/watchlist/src/components/TradingView/TradingViewChart'

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

interface ChartWithProviderProps {
  symbol: string
  timeframe: Timeframe
  height: number
  showSMA20: boolean
  showSMA50: boolean
  showSMA200: boolean
}

function ChartContent({
  symbol,
  timeframe,
  height,
  showSMA20,
  showSMA50,
  showSMA200,
}: ChartWithProviderProps) {
  const [chartMounted, setChartMounted] = useState(false)

  useEffect(() => {
    // Add a small delay to ensure ThemeProvider is fully mounted
    const timer = setTimeout(() => {
      setChartMounted(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  if (!chartMounted) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 dark:text-gray-400">Loading chart...</p>
      </div>
    )
  }

  return (
    <TradingViewChart
      symbol={symbol}
      timeframe={timeframe}
      height={height}
      showSMA20={showSMA20}
      showSMA50={showSMA50}
      showSMA200={showSMA200}
    />
  )
}

export default function ChartWithProvider(props: ChartWithProviderProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center justify-center" style={{ height: props.height }}>
        <p className="text-gray-500 dark:text-gray-400">Loading chart...</p>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <ChartContent {...props} />
    </ThemeProvider>
  )
}
