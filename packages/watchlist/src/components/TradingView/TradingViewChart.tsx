'use client'

import { useEffect, useRef } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, MouseEventParams, Time } from 'lightweight-charts'
import { Timeframe } from '@watchlist/types/chart'
import { useChartData } from '@watchlist/hooks/useChartData'
import { calculateSMA, filterRegularHoursOnly } from '@watchlist/utils/chart-helpers'
import { useDrawingTools, DrawingTool } from '@watchlist/hooks/useDrawingTools'
import { useTheme } from '@watchlist/components/ThemeProvider'
import { getChartTheme } from '@watchlist/utils/chart-theme'
// TEMPORARILY DISABLED: import { ExtendedHoursOverlay } from './plugins/extended-hours-overlay'

export interface TradingViewChartRef {
  clearAllDrawings: () => void
}

interface TradingViewChartProps {
  symbol: string
  timeframe?: Timeframe
  height?: number
  showSMA20?: boolean
  showSMA50?: boolean
  showSMA200?: boolean
  drawingTool?: DrawingTool
  onDrawingComplete?: () => void
  onClearAll?: () => void
  onClose?: () => void
}

/**
 * TradingView Lightweight Charts component
 *
 * Displays candlestick charts with data from FMP API
 */
export function TradingViewChart({
  symbol,
  timeframe = '15m',
  height = 500,
  showSMA20 = false,
  showSMA50 = false,
  showSMA200 = false,
  drawingTool = 'none',
  onDrawingComplete,
  onClearAll,
  onClose
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const sma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const sma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  // Track visibility state to prevent race conditions with worker
  const sma20VisibleRef = useRef(false)
  const sma50VisibleRef = useRef(false)
  const sma200VisibleRef = useRef(false)
  // TEMPORARILY DISABLED: const extendedHoursOverlayRef = useRef<ExtendedHoursOverlay | null>(null)

  const { theme } = useTheme()
  const { data, loading, error } = useChartData(symbol, timeframe)
  const { handleChartClick, clearAllDrawings } = useDrawingTools(chartRef, candlestickSeriesRef, drawingTool)

  // Get theme colors
  const isDarkMode = theme === 'dark'
  const themeColors = getChartTheme(isDarkMode)

  // Expose clearAllDrawings to parent via callback
  useEffect(() => {
    if (onClearAll) {
      // Store function reference so parent can call it
      ;(window as any).__chartClearAll = clearAllDrawings
    }
  }, [clearAllDrawings, onClearAll])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) {
      return
    }

    // Create chart with theme-aware colors
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: themeColors.layout.background },
        textColor: themeColors.layout.textColor,
        fontSize: 14,
      },
      grid: {
        vertLines: { color: themeColors.grid.vertLines },
        horzLines: { color: themeColors.grid.horzLines },
      },
      crosshair: {
        mode: 0, // Normal crosshair mode (v5 uses enum values)
      },
      timeScale: {
        borderColor: themeColors.timeScale.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: themeColors.timeScale.borderColor,
      },
    })

    // Add candlestick series with theme colors
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: themeColors.candlestick.upColor,
      downColor: themeColors.candlestick.downColor,
      borderVisible: false,
      wickUpColor: themeColors.candlestick.wickUpColor,
      wickDownColor: themeColors.candlestick.wickDownColor,
      priceLineVisible: false,
    })

    // Add SMA line series with theme colors
    const sma20Series = chart.addSeries(LineSeries, {
      color: themeColors.indicators.sma20,
      lineWidth: 2,
      title: 'SMA 20',
      visible: false,
      priceLineVisible: false,
    })

    const sma50Series = chart.addSeries(LineSeries, {
      color: themeColors.indicators.sma50,
      lineWidth: 2,
      title: 'SMA 50',
      visible: false,
      priceLineVisible: false,
    })

    const sma200Series = chart.addSeries(LineSeries, {
      color: themeColors.indicators.sma200,
      lineWidth: 2,
      title: 'SMA 200',
      visible: false,
      priceLineVisible: false,
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries
    sma20SeriesRef.current = sma20Series
    sma50SeriesRef.current = sma50Series
    sma200SeriesRef.current = sma200Series

    // TEMPORARILY DISABLED: Add extended hours overlay (will be controlled by checkbox)
    // const extendedHoursOverlay = new ExtendedHoursOverlay(chart, candlestickSeries, {
    //   color: 'rgba(173, 216, 230, 0.15)',
    // })
    // extendedHoursOverlayRef.current = extendedHoursOverlay

    // // Attach overlay only if showExtendedHours is true
    // if (showExtendedHours) {
    //   candlestickSeries.attachPrimitive(extendedHoursOverlay)
    // } else {
    // }

    // Subscribe to click events for drawing tools
    chart.subscribeClick(handleChartClick)

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.unsubscribeClick(handleChartClick)
      chart.remove()
      chartRef.current = null
      candlestickSeriesRef.current = null
      // TEMPORARILY DISABLED: extendedHoursOverlayRef.current = null
    }
  }, [handleChartClick, themeColors])

  // Handle height changes separately without destroying the chart
  useEffect(() => {
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        height: height,
        width: chartContainerRef.current.clientWidth,
      })
    }
  }, [height])

  // Initialize Web Worker for SMA calculations
  useEffect(() => {
    // Create worker
    workerRef.current = new Worker('/sma-worker.js')

    // Handle worker messages
    workerRef.current.onmessage = (event) => {
      const { results, error } = event.data

      if (error) {
        console.error('SMA Worker error:', error)
        return
      }

      if (results) {
        // Update SMA series with calculated data ONLY if still visible
        // This prevents race conditions when user toggles visibility quickly
        if (sma20SeriesRef.current && results[20] && sma20VisibleRef.current) {
          sma20SeriesRef.current.setData(results[20])
        }
        if (sma50SeriesRef.current && results[50] && sma50VisibleRef.current) {
          sma50SeriesRef.current.setData(results[50])
        }
        if (sma200SeriesRef.current && results[200] && sma200VisibleRef.current) {
          sma200SeriesRef.current.setData(results[200])
        }
      }
    }

    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // Update candlestick data when data changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !data || data.length === 0) {
      return
    }

    // Always show all data (don't filter)
    const chartData = data.map(candle => ({
      time: candle.time as Time, // Cast to Time type for TypeScript
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))

    candlestickSeriesRef.current.setData(chartData)

    // Set visible range to show only last 2 years instead of all data
    if (chartRef.current && chartData.length > 0) {
      const latestTime = chartData[chartData.length - 1].time

      // Calculate time 2 years ago (in seconds)
      const twoYearsAgo = (latestTime as number) - (2 * 365 * 24 * 60 * 60)

      // Set the visible range
      chartRef.current.timeScale().setVisibleRange({
        from: twoYearsAgo as Time,
        to: latestTime as Time,
      })

      // Add right padding (15 bars worth of space on the right side)
      // This creates breathing room between the latest candle and the y-axis
      chartRef.current.timeScale().applyOptions({
        rightOffset: 15,
      })
    }
  }, [data])

  // Handle SMA visibility changes separately
  useEffect(() => {
    if (!data || data.length === 0) {
      return
    }

    // Toggle SMA visibility and update refs
    if (sma20SeriesRef.current) {
      sma20VisibleRef.current = showSMA20
      sma20SeriesRef.current.applyOptions({ visible: showSMA20 })
    }
    if (sma50SeriesRef.current) {
      sma50VisibleRef.current = showSMA50
      sma50SeriesRef.current.applyOptions({ visible: showSMA50 })
    }
    if (sma200SeriesRef.current) {
      sma200VisibleRef.current = showSMA200
      sma200SeriesRef.current.applyOptions({ visible: showSMA200 })
    }

    // Calculate SMAs using Web Worker (non-blocking)
    const periodsToCalculate = []
    if (showSMA20 && data.length >= 20) periodsToCalculate.push(20)
    if (showSMA50 && data.length >= 50) periodsToCalculate.push(50)
    if (showSMA200 && data.length >= 200) periodsToCalculate.push(200)

    if (periodsToCalculate.length > 0 && workerRef.current) {
      // Send data to worker for calculation
      workerRef.current.postMessage({
        data: data,
        periods: periodsToCalculate
      })
    }
  }, [data, showSMA20, showSMA50, showSMA200])

  return (
    <div className="relative w-full">
      {/* Chart Container */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading chart...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
            <div className="text-center text-red-600 dark:text-red-400 p-4">
              <p className="font-semibold">Failed to load chart</p>
              <p className="text-sm mt-1">{error.message}</p>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
      </div>
    </div>
  )
}