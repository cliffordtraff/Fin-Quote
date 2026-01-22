'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Navigation from '@/components/Navigation'
import { getMag7Returns, type Mag7StockReturn } from '@/app/actions/mag7-returns'
import { getSP500Distribution, type SP500DistributionData } from '@/app/actions/sp500-distribution'
import { getAdvanceDeclineSnapshot, type AdvanceDeclineSnapshot } from '@/app/actions/advance-decline'
import { getNYSEAdvanceDeclineSnapshot, type NYSEAdvanceDeclineSnapshot } from '@/app/actions/nyse-advance-decline'
import { computeKDE, splitDistributionPath, getAxisRange } from '@/lib/distribution-utils'

// Chart dimensions
const CHART_WIDTH = 1000
const CHART_HEIGHT = 500
const MARGIN = { top: 60, right: 40, bottom: 60, left: 40 }
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

// Histogram chart dimensions
const HIST_CHART_HEIGHT = 300
const HIST_MARGIN = { top: 40, right: 40, bottom: 60, left: 60 }
const HIST_INNER_WIDTH = CHART_WIDTH - HIST_MARGIN.left - HIST_MARGIN.right
const HIST_INNER_HEIGHT = HIST_CHART_HEIGHT - HIST_MARGIN.top - HIST_MARGIN.bottom
const NUM_BINS = 40 // Number of histogram bins

interface TooltipData {
  x: number
  y: number
  count: number
  rangeStart: number
  rangeEnd: number
}

interface KDETooltipData {
  x: number
  y: number
  count: number
  rangeStart: number
  rangeEnd: number
  sliceIndex: number
}

interface StockTooltipData {
  x: number
  y: number
  symbol: string
  name: string
  returnPct: number
}

const KDE_NUM_SLICES = 40 // Number of interactive slices for KDE chart

// Advance-Decline chart dimensions
const AD_CHART_WIDTH = 700
const AD_CHART_HEIGHT = 450
const AD_MARGIN = { top: 40, right: 40, bottom: 60, left: 70 }
const AD_INNER_WIDTH = AD_CHART_WIDTH - AD_MARGIN.left - AD_MARGIN.right
const AD_INNER_HEIGHT = AD_CHART_HEIGHT - AD_MARGIN.top - AD_MARGIN.bottom
const AD_POLL_INTERVAL = 120000 // Poll every 2 minutes

// Trading day constants (Eastern Time)
const MARKET_OPEN_HOUR = 9
const MARKET_OPEN_MINUTE = 30
const MARKET_CLOSE_HOUR = 16
const MARKET_CLOSE_MINUTE = 0

// Available timeframes in minutes
type Timeframe = 2 | 5 | 15
const TIMEFRAME_OPTIONS: Timeframe[] = [2, 5, 15]

// Calculate total candles for a given timeframe
const getTotalCandles = (timeframe: Timeframe) => {
  const tradingMinutes = (MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE) - (MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE)
  return Math.floor(tradingMinutes / timeframe)
}

// OHLC Candle interface for A/D chart
interface ADCandle {
  time: string // HH:MM format
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  advances: number
  declines: number
  unchanged: number
}

// Generate fake historical A/D candles from market open to now
function generateFakeHistoricalADCandles(timeframe: Timeframe = 2): ADCandle[] {
  const now = new Date()
  const marketOpen = new Date(now)
  marketOpen.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE, 0, 0)

  const marketClose = new Date(now)
  marketClose.setHours(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE, 0, 0)

  // If before market open, return empty
  if (now < marketOpen) return []

  const candles: ADCandle[] = []
  const intervalMs = timeframe * 60 * 1000

  // Start with a slight positive bias
  let currentAD = Math.floor(Math.random() * 100) - 20

  let currentTime = new Date(marketOpen)
  const endTime = now < marketClose ? now : marketClose

  // Scale volatility based on timeframe
  const baseVolatility = 30 * Math.sqrt(timeframe / 2)

  while (currentTime <= endTime) {
    // Generate OHLC for this candle
    const open = Math.round(currentAD)

    // Simulate intra-candle movement
    const volatility = baseVolatility
    const change1 = (Math.random() - 0.5) * volatility
    const change2 = (Math.random() - 0.5) * volatility
    const change3 = (Math.random() - 0.5) * volatility

    const mid1 = currentAD + change1
    const mid2 = mid1 + change2
    const close = Math.round(Math.max(-450, Math.min(450, mid2 + change3)))

    const high = Math.round(Math.max(open, close, mid1, mid2) + Math.random() * 10)
    const low = Math.round(Math.min(open, close, mid1, mid2) - Math.random() * 10)

    // Calculate advances and declines
    const totalStocks = 500
    const unchanged = Math.floor(Math.random() * 20) + 5
    const tradingStocks = totalStocks - unchanged
    const advances = Math.floor((tradingStocks / 2) + (close / 2))
    const declines = tradingStocks - advances

    const timestamp = currentTime.toISOString()
    const time = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    candles.push({
      time,
      timestamp,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      advances: Math.max(0, advances),
      declines: Math.max(0, declines),
      unchanged,
    })

    // Update for next candle - close becomes next open with slight drift
    const momentum = currentAD > 0 ? -0.05 : 0.05
    currentAD = close + (Math.random() - 0.5 + momentum) * 20
    currentAD = Math.max(-450, Math.min(450, currentAD))

    currentTime = new Date(currentTime.getTime() + intervalMs)
  }

  return candles
}

// Generate fake historical NYSE A/D candles (NYSE has ~2,971 stocks vs S&P 500's ~500)
function generateFakeHistoricalNYSECandles(timeframe: Timeframe = 2): ADCandle[] {
  const now = new Date()
  const marketOpen = new Date(now)
  marketOpen.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE, 0, 0)

  const marketClose = new Date(now)
  marketClose.setHours(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE, 0, 0)

  // If before market open, return empty
  if (now < marketOpen) return []

  const candles: ADCandle[] = []
  const intervalMs = timeframe * 60 * 1000

  // Start with a slight positive bias - NYSE scale is ~6x larger
  let currentAD = Math.floor(Math.random() * 600) - 100

  let currentTime = new Date(marketOpen)
  const endTime = now < marketClose ? now : marketClose

  // Scale volatility based on timeframe
  const baseVolatility = 180 * Math.sqrt(timeframe / 2)

  while (currentTime <= endTime) {
    // Generate OHLC for this candle
    const open = Math.round(currentAD)

    // Simulate intra-candle movement - larger volatility for NYSE
    const volatility = baseVolatility
    const change1 = (Math.random() - 0.5) * volatility
    const change2 = (Math.random() - 0.5) * volatility
    const change3 = (Math.random() - 0.5) * volatility

    const mid1 = currentAD + change1
    const mid2 = mid1 + change2
    const close = Math.round(Math.max(-1800, Math.min(1800, mid2 + change3)))

    const high = Math.round(Math.max(open, close, mid1, mid2) + Math.random() * 60)
    const low = Math.round(Math.min(open, close, mid1, mid2) - Math.random() * 60)

    // Calculate advances and declines - NYSE has ~2,971 stocks
    const totalStocks = 2971
    const unchanged = Math.floor(Math.random() * 100) + 20
    const tradingStocks = totalStocks - unchanged
    const advances = Math.floor((tradingStocks / 2) + (close / 2))
    const declines = tradingStocks - advances

    const timestamp = currentTime.toISOString()
    const time = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    candles.push({
      time,
      timestamp,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      advances: Math.max(0, advances),
      declines: Math.max(0, declines),
      unchanged,
    })

    // Update for next candle - close becomes next open with slight drift
    const momentum = currentAD > 0 ? -0.05 : 0.05
    currentAD = close + (Math.random() - 0.5 + momentum) * 120
    currentAD = Math.max(-1800, Math.min(1800, currentAD))

    currentTime = new Date(currentTime.getTime() + intervalMs)
  }

  return candles
}

// Get candle index from time string (HH:MM)
function getCandleIndex(time: string, timeframe: Timeframe): number {
  const [hours, minutes] = time.split(':').map(Number)
  const minutesSinceOpen = (hours * 60 + minutes) - (MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE)
  return Math.floor(minutesSinceOpen / timeframe)
}

export default function ConceptChartPage() {
  const [mag7Data, setMag7Data] = useState<Mag7StockReturn[]>([])
  const [distributionData, setDistributionData] = useState<SP500DistributionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [kdeTooltip, setKdeTooltip] = useState<KDETooltipData | null>(null)
  const [stockTooltip, setStockTooltip] = useState<StockTooltipData | null>(null)

  // Timeframe state for both charts
  const [spTimeframe, setSpTimeframe] = useState<Timeframe>(2)
  const [nyseTimeframe, setNyseTimeframe] = useState<Timeframe>(2)

  // Advance-Decline intraday candle data - initialize with fake historical data
  const [adCandles, setAdCandles] = useState<ADCandle[]>(() => generateFakeHistoricalADCandles(2))
  const [adLoading, setAdLoading] = useState(true)
  const adPollingRef = useRef<NodeJS.Timeout | null>(null)

  // NYSE Advance-Decline intraday candle data
  const [nyseCandles, setNyseCandles] = useState<ADCandle[]>(() => generateFakeHistoricalNYSECandles(2))
  const [nyseLoading, setNyseLoading] = useState(true)
  const nysePollingRef = useRef<NodeJS.Timeout | null>(null)

  // Regenerate fake data when timeframe changes
  useEffect(() => {
    setAdCandles(generateFakeHistoricalADCandles(spTimeframe))
  }, [spTimeframe])

  useEffect(() => {
    setNyseCandles(generateFakeHistoricalNYSECandles(nyseTimeframe))
  }, [nyseTimeframe])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        // Fetch both Mag 7 and S&P 500 distribution data in parallel
        const [mag7Result, distResult] = await Promise.all([
          getMag7Returns(),
          getSP500Distribution(),
        ])

        if ('error' in mag7Result) {
          setError(mag7Result.error)
          return
        }

        if ('error' in distResult) {
          setError(distResult.error)
          return
        }

        setMag7Data(mag7Result.data)
        setDistributionData(distResult.data)
      } catch (e) {
        setError('Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Fetch advance-decline snapshot and convert to candle
  const fetchAdSnapshot = useCallback(async () => {
    const result = await getAdvanceDeclineSnapshot()
    if ('data' in result) {
      const snapshot = result.data
      setAdCandles(prev => {
        // Check if we already have a candle at this time
        const existingIndex = prev.findIndex(c => c.time === snapshot.time)

        if (existingIndex >= 0) {
          // Update existing candle - adjust high/low/close
          const existing = prev[existingIndex]
          const updated: ADCandle = {
            ...existing,
            high: Math.max(existing.high, snapshot.advanceDeclineLine),
            low: Math.min(existing.low, snapshot.advanceDeclineLine),
            close: snapshot.advanceDeclineLine,
            advances: snapshot.advances,
            declines: snapshot.declines,
            unchanged: snapshot.unchanged,
          }
          return [...prev.slice(0, existingIndex), updated, ...prev.slice(existingIndex + 1)]
        }

        // Create new candle
        const newCandle: ADCandle = {
          time: snapshot.time,
          timestamp: snapshot.timestamp,
          open: snapshot.advanceDeclineLine,
          high: snapshot.advanceDeclineLine,
          low: snapshot.advanceDeclineLine,
          close: snapshot.advanceDeclineLine,
          advances: snapshot.advances,
          declines: snapshot.declines,
          unchanged: snapshot.unchanged,
        }
        return [...prev, newCandle]
      })
    }
    setAdLoading(false)
  }, [])

  // Poll for advance-decline data
  useEffect(() => {
    // Fetch initial snapshot
    fetchAdSnapshot()

    // Set up polling
    adPollingRef.current = setInterval(fetchAdSnapshot, AD_POLL_INTERVAL)

    return () => {
      if (adPollingRef.current) {
        clearInterval(adPollingRef.current)
      }
    }
  }, [fetchAdSnapshot])

  // Fetch NYSE advance-decline snapshot and convert to candle
  const fetchNyseSnapshot = useCallback(async () => {
    const result = await getNYSEAdvanceDeclineSnapshot()
    if ('data' in result) {
      const snapshot = result.data
      setNyseCandles(prev => {
        // Check if we already have a candle at this time
        const existingIndex = prev.findIndex(c => c.time === snapshot.time)

        if (existingIndex >= 0) {
          // Update existing candle - adjust high/low/close
          const existing = prev[existingIndex]
          const updated: ADCandle = {
            ...existing,
            high: Math.max(existing.high, snapshot.advanceDeclineLine),
            low: Math.min(existing.low, snapshot.advanceDeclineLine),
            close: snapshot.advanceDeclineLine,
            advances: snapshot.advances,
            declines: snapshot.declines,
            unchanged: snapshot.unchanged,
          }
          return [...prev.slice(0, existingIndex), updated, ...prev.slice(existingIndex + 1)]
        }

        // Create new candle
        const newCandle: ADCandle = {
          time: snapshot.time,
          timestamp: snapshot.timestamp,
          open: snapshot.advanceDeclineLine,
          high: snapshot.advanceDeclineLine,
          low: snapshot.advanceDeclineLine,
          close: snapshot.advanceDeclineLine,
          advances: snapshot.advances,
          declines: snapshot.declines,
          unchanged: snapshot.unchanged,
        }
        return [...prev, newCandle]
      })
    }
    setNyseLoading(false)
  }, [])

  // Poll for NYSE advance-decline data
  useEffect(() => {
    // Fetch initial snapshot
    fetchNyseSnapshot()

    // Set up polling
    nysePollingRef.current = setInterval(fetchNyseSnapshot, AD_POLL_INTERVAL)

    return () => {
      if (nysePollingRef.current) {
        clearInterval(nysePollingRef.current)
      }
    }
  }, [fetchNyseSnapshot])

  // Calculate axis range - fixed at -7.5% to +7.5%
  const axisRange = useMemo(() => {
    return { min: -7.5, max: 7.5 }
  }, [])

  // Compute KDE distribution curve
  const kdePoints = useMemo(() => {
    if (!distributionData) return []
    const returns = distributionData.returns.map(r => r.returnPct)
    return computeKDE(returns, axisRange.min, axisRange.max, 200)
  }, [distributionData, axisRange])

  // Scale functions
  const xScale = (x: number) => {
    return MARGIN.left + ((x - axisRange.min) / (axisRange.max - axisRange.min)) * INNER_WIDTH
  }

  const yScale = useMemo(() => {
    if (kdePoints.length === 0) return () => MARGIN.top + INNER_HEIGHT
    const maxDensity = Math.max(...kdePoints.map(p => p.y))
    return (y: number) => {
      // Invert y so curve goes up from baseline
      return MARGIN.top + INNER_HEIGHT - (y / maxDensity) * INNER_HEIGHT * 0.85
    }
  }, [kdePoints])

  const baselineY = MARGIN.top + INNER_HEIGHT

  // Generate distribution paths
  const { negativePath, positivePath, outlinePath } = useMemo(() => {
    if (kdePoints.length === 0) {
      return { negativePath: '', positivePath: '', outlinePath: '' }
    }
    return splitDistributionPath(kdePoints, xScale, yScale, baselineY)
  }, [kdePoints, xScale, yScale, baselineY])

  // Generate x-axis ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = []
    const step = axisRange.max - axisRange.min > 15 ? 2.5 : 1
    for (let x = Math.ceil(axisRange.min / step) * step; x <= axisRange.max; x += step) {
      ticks.push(x)
    }
    return ticks
  }, [axisRange])

  // Position Mag 7 tickers - spread them vertically within the upper portion of the chart
  // Y position is purely for visual spacing, not related to density
  const mag7Positions = useMemo(() => {
    if (mag7Data.length === 0) return []

    // Sort by return to spread them nicely
    const sorted = [...mag7Data].sort((a, b) => a.changesPercentage - b.changesPercentage)

    return sorted.map((stock, index) => {
      const xPos = xScale(stock.changesPercentage)
      // Spread vertically in the upper 70% of the chart, staggered
      const yBase = MARGIN.top + INNER_HEIGHT * 0.15
      const yRange = INNER_HEIGHT * 0.55
      const yPos = yBase + (index / (sorted.length - 1 || 1)) * yRange

      return {
        ...stock,
        x: xPos,
        y: yPos,
      }
    })
  }, [mag7Data, xScale])

  // Compute histogram bins
  const histogramBins = useMemo(() => {
    if (!distributionData) return []

    const returns = distributionData.returns.map(r => r.returnPct)
    const binWidth = (axisRange.max - axisRange.min) / NUM_BINS
    const bins: { x: number; count: number }[] = []

    // Initialize bins
    for (let i = 0; i < NUM_BINS; i++) {
      const binStart = axisRange.min + i * binWidth
      bins.push({ x: binStart + binWidth / 2, count: 0 })
    }

    // Count returns in each bin
    for (const ret of returns) {
      const binIndex = Math.floor((ret - axisRange.min) / binWidth)
      // Clamp to valid bin range
      const clampedIndex = Math.max(0, Math.min(NUM_BINS - 1, binIndex))
      bins[clampedIndex].count++
    }

    return bins
  }, [distributionData, axisRange])

  // Histogram scale functions
  const histXScale = (x: number) => {
    return HIST_MARGIN.left + ((x - axisRange.min) / (axisRange.max - axisRange.min)) * HIST_INNER_WIDTH
  }

  const histYScale = useMemo(() => {
    if (histogramBins.length === 0) return () => HIST_MARGIN.top + HIST_INNER_HEIGHT
    const maxCount = Math.max(...histogramBins.map(b => b.count))
    return (count: number) => {
      return HIST_MARGIN.top + HIST_INNER_HEIGHT - (count / maxCount) * HIST_INNER_HEIGHT * 0.9
    }
  }, [histogramBins])

  const histBaselineY = HIST_MARGIN.top + HIST_INNER_HEIGHT
  const binWidthPct = (axisRange.max - axisRange.min) / NUM_BINS
  const barWidth = (HIST_INNER_WIDTH / NUM_BINS) - 2 // 2px gap between bars

  // Handle bar hover
  const handleBarHover = (event: React.MouseEvent<SVGRectElement>, bin: { x: number; count: number }, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const rangeStart = axisRange.min + index * binWidthPct
    const rangeEnd = rangeStart + binWidthPct
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      count: bin.count,
      rangeStart,
      rangeEnd,
    })
  }

  const handleBarLeave = () => {
    setTooltip(null)
  }

  // Compute KDE slice bins (for hover interaction)
  const kdeSliceBins = useMemo(() => {
    if (!distributionData) return []

    const sliceWidth = (axisRange.max - axisRange.min) / KDE_NUM_SLICES
    const bins: { rangeStart: number; rangeEnd: number; count: number }[] = []

    for (let i = 0; i < KDE_NUM_SLICES; i++) {
      const rangeStart = axisRange.min + i * sliceWidth
      const rangeEnd = rangeStart + sliceWidth
      const count = distributionData.returns.filter(
        r => r.returnPct >= rangeStart && r.returnPct < rangeEnd
      ).length
      bins.push({ rangeStart, rangeEnd, count })
    }

    return bins
  }, [distributionData, axisRange])

  // Handle KDE slice hover
  const handleKDESliceHover = (event: React.MouseEvent<SVGRectElement>, sliceIndex: number) => {
    const slice = kdeSliceBins[sliceIndex]
    if (!slice) return

    const rect = event.currentTarget.getBoundingClientRect()
    setKdeTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      count: slice.count,
      rangeStart: slice.rangeStart,
      rangeEnd: slice.rangeEnd,
      sliceIndex,
    })
  }

  const handleKDEMouseLeave = () => {
    setKdeTooltip(null)
  }

  // Handle stock ticker hover
  const handleStockHover = (event: React.MouseEvent<SVGGElement>, stock: Mag7StockReturn) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setStockTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      symbol: stock.symbol,
      name: stock.name,
      returnPct: stock.changesPercentage,
    })
  }

  const handleStockLeave = () => {
    setStockTooltip(null)
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Histogram Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-sm pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-white font-medium">{tooltip.count} stocks</div>
          <div className="text-gray-400 text-xs">
            {tooltip.rangeStart.toFixed(2)}% to {tooltip.rangeEnd.toFixed(2)}%
          </div>
        </div>
      )}

      {/* KDE Tooltip */}
      {kdeTooltip && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-sm pointer-events-none"
          style={{
            left: kdeTooltip.x,
            top: kdeTooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-white font-medium">{kdeTooltip.count} stocks</div>
          <div className="text-gray-400 text-xs">
            {kdeTooltip.rangeStart.toFixed(2)}% to {kdeTooltip.rangeEnd.toFixed(2)}%
          </div>
        </div>
      )}

      {/* Stock Ticker Tooltip */}
      {stockTooltip && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-sm pointer-events-none"
          style={{
            left: stockTooltip.x,
            top: stockTooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-cyan-400 font-semibold">{stockTooltip.symbol}</div>
          <div className="text-gray-400 text-xs">{stockTooltip.name}</div>
          <div className={`font-medium ${stockTooltip.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stockTooltip.returnPct >= 0 ? '+' : ''}{stockTooltip.returnPct.toFixed(2)}%
          </div>
        </div>
      )}

      <Navigation />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-black rounded-xl p-6">
          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            S&P 500 Daily Return Distribution
          </h1>
          {distributionData && (
            <p className="text-gray-400 text-center text-sm mb-4">
              1D% Return Distribution For SPX Individual Constituents
            </p>
          )}

          {loading ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-gray-400">Loading S&P 500 data...</div>
            </div>
          ) : error ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-red-500">{error}</div>
            </div>
          ) : (
            <div className="relative">
              {/* Summary Label - Top Left */}
              {distributionData && (
                <div className="absolute top-2 left-12 z-10 text-sm font-medium">
                  <div className="text-green-400">Stocks Up: {distributionData.stocksUp}</div>
                  <div className="text-red-400">Stocks Down: {distributionData.stocksDown}</div>
                  <div className="text-white">
                    SPX Daily % Change: {distributionData.spxReturnPct >= 0 ? '+' : ''}
                    {distributionData.spxReturnPct.toFixed(2)}%
                  </div>
                </div>
              )}

              {/* Legend - Top Right */}
              {distributionData && (
                <div className="absolute top-2 right-12 z-10 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-0.5 bg-yellow-400" />
                    <span className="text-gray-300">Weighted Distribution</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-0.5 border-t border-dashed border-gray-400" />
                    <span className="text-gray-300">
                      Avg. Daily Return: {distributionData.avgReturn >= 0 ? '+' : ''}
                      {distributionData.avgReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-0.5 border-t border-dashed border-green-500" />
                    <span className="text-gray-300">
                      Avg. Gain: +{distributionData.avgGain.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 border-t border-dashed border-orange-500" />
                    <span className="text-gray-300">
                      Avg. Decline: {distributionData.avgDecline.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* SVG Chart */}
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="w-full h-auto"
                style={{ maxHeight: '600px' }}
              >
                {/* Distribution mountain - negative (red/brown) */}
                <path
                  d={negativePath}
                  fill="rgba(139, 69, 19, 0.7)"
                  stroke="none"
                />

                {/* Distribution mountain - positive (green) */}
                <path
                  d={positivePath}
                  fill="rgba(34, 139, 34, 0.7)"
                  stroke="none"
                />

                {/* Distribution outline (yellow) */}
                <path
                  d={outlinePath}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="2"
                />

                {/* Interactive slices under the curve - curved tops to match bell curve */}
                {kdeSliceBins.map((slice, index) => {
                  const sliceWidth = INNER_WIDTH / KDE_NUM_SLICES
                  const sliceXStart = MARGIN.left + index * sliceWidth
                  const sliceXEnd = sliceXStart + sliceWidth
                  const isHovered = kdeTooltip?.sliceIndex === index

                  // Get KDE points that fall within this slice
                  const slicePoints = kdePoints.filter(
                    p => p.x >= slice.rangeStart && p.x <= slice.rangeEnd
                  )

                  // Build a path: start at baseline left, go up along curve, then back down to baseline right
                  let pathD = `M ${sliceXStart} ${baselineY}`

                  // If we have curve points, trace along them
                  if (slicePoints.length > 0) {
                    // Line to first curve point
                    pathD += ` L ${xScale(slicePoints[0].x)} ${yScale(slicePoints[0].y)}`
                    // Trace along curve
                    for (let i = 1; i < slicePoints.length; i++) {
                      pathD += ` L ${xScale(slicePoints[i].x)} ${yScale(slicePoints[i].y)}`
                    }
                    // Line to end of slice at curve height
                    pathD += ` L ${sliceXEnd} ${yScale(slicePoints[slicePoints.length - 1].y)}`
                  } else {
                    // No points in slice, interpolate from nearest points
                    const nearestPoint = kdePoints.reduce((nearest, p) => {
                      const midPct = (slice.rangeStart + slice.rangeEnd) / 2
                      return Math.abs(p.x - midPct) < Math.abs(nearest.x - midPct) ? p : nearest
                    }, kdePoints[0])
                    const curveY = nearestPoint ? yScale(nearestPoint.y) : baselineY
                    pathD += ` L ${sliceXStart} ${curveY} L ${sliceXEnd} ${curveY}`
                  }

                  // Close path back to baseline
                  pathD += ` L ${sliceXEnd} ${baselineY} Z`

                  return (
                    <path
                      key={`kde-slice-${index}`}
                      d={pathD}
                      fill={isHovered ? 'rgba(255, 255, 255, 0.2)' : 'transparent'}
                      stroke={isHovered ? 'rgba(255, 255, 255, 0.5)' : 'none'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      onMouseEnter={(e) => handleKDESliceHover(e, index)}
                      onMouseLeave={handleKDEMouseLeave}
                    />
                  )
                })}

                {/* Grid lines (vertical, dashed) */}
                {xTicks.map((tick) => (
                  <line
                    key={tick}
                    x1={xScale(tick)}
                    y1={MARGIN.top}
                    x2={xScale(tick)}
                    y2={baselineY}
                    stroke={tick === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={tick === 0 ? 1.5 : 1}
                    strokeDasharray={tick === 0 ? '4,4' : '2,4'}
                  />
                ))}

                {/* Average return line (dashed gray) */}
                {distributionData && (
                  <line
                    x1={xScale(distributionData.avgReturn)}
                    y1={MARGIN.top}
                    x2={xScale(distributionData.avgReturn)}
                    y2={baselineY}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                )}

                {/* Average gain line (dashed green) */}
                {distributionData && distributionData.avgGain > 0 && (
                  <line
                    x1={xScale(distributionData.avgGain)}
                    y1={MARGIN.top}
                    x2={xScale(distributionData.avgGain)}
                    y2={baselineY}
                    stroke="rgba(34, 197, 94, 0.8)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                )}

                {/* Average decline line (dashed orange) */}
                {distributionData && distributionData.avgDecline < 0 && (
                  <line
                    x1={xScale(distributionData.avgDecline)}
                    y1={MARGIN.top}
                    x2={xScale(distributionData.avgDecline)}
                    y2={baselineY}
                    stroke="rgba(249, 115, 22, 0.8)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                )}

                {/* X-axis baseline */}
                <line
                  x1={MARGIN.left}
                  y1={baselineY}
                  x2={MARGIN.left + INNER_WIDTH}
                  y2={baselineY}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="1"
                />

                {/* X-axis labels */}
                {xTicks.map((tick) => (
                  <text
                    key={`label-${tick}`}
                    x={xScale(tick)}
                    y={baselineY + 25}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize="12"
                  >
                    {tick}%
                  </text>
                ))}

                {/* Mag 7 ticker labels */}
                {mag7Positions.map((stock) => (
                  <g
                    key={stock.symbol}
                    className="cursor-pointer"
                    onMouseEnter={(e) => handleStockHover(e, stock)}
                    onMouseLeave={handleStockLeave}
                  >
                    {/* Dot */}
                    <circle
                      cx={stock.x}
                      cy={stock.y + 12}
                      r="4"
                      fill="cyan"
                      className="transition-all hover:r-6"
                    />
                    {/* Label */}
                    <text
                      x={stock.x}
                      y={stock.y}
                      textAnchor="middle"
                      fill="white"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {stock.symbol}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Histogram Chart */}
              <h2 className="text-xl font-bold text-white text-center mt-8 mb-4">
                Histogram View (Raw Bins)
              </h2>
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${HIST_CHART_HEIGHT}`}
                className="w-full h-auto"
                style={{ maxHeight: '350px' }}
              >
                {/* Grid lines (vertical, dashed) */}
                {xTicks.map((tick) => (
                  <line
                    key={`hist-grid-${tick}`}
                    x1={histXScale(tick)}
                    y1={HIST_MARGIN.top}
                    x2={histXScale(tick)}
                    y2={histBaselineY}
                    stroke={tick === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={tick === 0 ? 1.5 : 1}
                    strokeDasharray={tick === 0 ? '4,4' : '2,4'}
                  />
                ))}

                {/* Histogram bars */}
                {histogramBins.map((bin, index) => {
                  const barHeight = histBaselineY - histYScale(bin.count)
                  const isNegative = bin.x < 0
                  return (
                    <rect
                      key={`bar-${index}`}
                      x={histXScale(bin.x) - barWidth / 2}
                      y={histYScale(bin.count)}
                      width={barWidth}
                      height={barHeight}
                      fill={isNegative ? 'rgba(185, 28, 28, 0.8)' : 'rgba(34, 197, 94, 0.8)'}
                      stroke={isNegative ? 'rgb(185, 28, 28)' : 'rgb(34, 197, 94)'}
                      strokeWidth="1"
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      onMouseEnter={(e) => handleBarHover(e, bin, index)}
                      onMouseLeave={handleBarLeave}
                    />
                  )
                })}

                {/* X-axis baseline */}
                <line
                  x1={HIST_MARGIN.left}
                  y1={histBaselineY}
                  x2={HIST_MARGIN.left + HIST_INNER_WIDTH}
                  y2={histBaselineY}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="1"
                />

                {/* X-axis labels */}
                {xTicks.map((tick) => (
                  <text
                    key={`hist-label-${tick}`}
                    x={histXScale(tick)}
                    y={histBaselineY + 25}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize="12"
                  >
                    {tick}%
                  </text>
                ))}

                {/* Y-axis label */}
                <text
                  x={HIST_MARGIN.left - 40}
                  y={HIST_MARGIN.top + HIST_INNER_HEIGHT / 2}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.7)"
                  fontSize="12"
                  transform={`rotate(-90, ${HIST_MARGIN.left - 40}, ${HIST_MARGIN.top + HIST_INNER_HEIGHT / 2})`}
                >
                  # of Stocks
                </text>

                {/* Mag 7 ticker labels - positioned to avoid overlaps */}
                {(() => {
                  // Sort by return percentage to position left-to-right
                  const sorted = [...mag7Data].sort((a, b) => a.changesPercentage - b.changesPercentage)

                  // Assign alternating y positions to avoid horizontal overlap
                  const yLevels = [
                    HIST_MARGIN.top + 20,
                    HIST_MARGIN.top + 50,
                    HIST_MARGIN.top + 80,
                    HIST_MARGIN.top + 110,
                  ]

                  return sorted.map((stock, index) => {
                    const xPos = histXScale(stock.changesPercentage)
                    // Alternate between y levels
                    const yPos = yLevels[index % yLevels.length]

                    return (
                      <g
                        key={`hist-${stock.symbol}`}
                        className="cursor-pointer"
                        onMouseEnter={(e) => handleStockHover(e, stock)}
                        onMouseLeave={handleStockLeave}
                      >
                        {/* Dot */}
                        <circle
                          cx={xPos}
                          cy={yPos + 12}
                          r="4"
                          fill="cyan"
                        />
                        {/* Label */}
                        <text
                          x={xPos}
                          y={yPos}
                          textAnchor="middle"
                          fill="white"
                          fontSize="11"
                          fontWeight="600"
                        >
                          {stock.symbol}
                        </text>
                      </g>
                    )
                  })
                })()}
              </svg>

              {/* Advance-Decline Candlestick Chart */}
              <div className="flex items-center justify-center gap-4 mt-8 mb-4">
                <h2 className="text-xl font-bold text-white">
                  S&P 500 Advance-Decline
                </h2>
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                  {TIMEFRAME_OPTIONS.map((tf) => (
                    <button
                      key={`sp-${tf}`}
                      onClick={() => setSpTimeframe(tf)}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                        spTimeframe === tf
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {tf}m
                    </button>
                  ))}
                </div>
              </div>

              {adLoading && adCandles.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center">
                  <div className="text-gray-400">Loading advance-decline data...</div>
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${AD_CHART_WIDTH} ${AD_CHART_HEIGHT}`}
                  className="w-full h-auto border border-gray-700 rounded-lg"
                  style={{ maxWidth: '700px', margin: '0 auto', display: 'block' }}
                >
                  {(() => {
                    // Fixed y-axis range: -500 to +500
                    const yMin = -500
                    const yMax = 500

                    // X scale based on fixed trading day
                    const totalCandles = getTotalCandles(spTimeframe)
                    const candleWidth = AD_INNER_WIDTH / totalCandles
                    const adXScale = (index: number) => {
                      return AD_MARGIN.left + (index * candleWidth) + (candleWidth / 2)
                    }

                    const adYScale = (value: number) => {
                      return AD_MARGIN.top + AD_INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * AD_INNER_HEIGHT
                    }

                    const zeroY = adYScale(0)

                    // Fixed y-axis ticks: -500, -250, 0, +250, +500
                    const yTicks = [-500, -250, 0, 250, 500]

                    // X-axis time labels (every hour from 9:30 to 4:00) in 12-hour format
                    const xTimeLabels = [
                      { display: '9:30', military: '09:30' },
                      { display: '10:00', military: '10:00' },
                      { display: '10:30', military: '10:30' },
                      { display: '11:00', military: '11:00' },
                      { display: '11:30', military: '11:30' },
                      { display: '12:00', military: '12:00' },
                      { display: '12:30', military: '12:30' },
                      { display: '1:00', military: '13:00' },
                      { display: '1:30', military: '13:30' },
                      { display: '2:00', military: '14:00' },
                      { display: '2:30', military: '14:30' },
                      { display: '3:00', military: '15:00' },
                      { display: '3:30', military: '15:30' },
                      { display: '4:00', military: '16:00' },
                    ]

                    const latestCandle = adCandles.length > 0 ? adCandles[adCandles.length - 1] : null
                    const latestValue = latestCandle ? latestCandle.close : 0
                    const isPositive = latestValue >= 0

                    return (
                      <>
                        {/* Horizontal grid lines */}
                        {yTicks.map((tick) => (
                          <line
                            key={`ad-grid-${tick}`}
                            x1={AD_MARGIN.left}
                            y1={adYScale(tick)}
                            x2={AD_MARGIN.left + AD_INNER_WIDTH}
                            y2={adYScale(tick)}
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth={1}
                            strokeDasharray="4,4"
                          />
                        ))}

                        {/* Zero line - prominent horizontal line at y=0 */}
                        <line
                          x1={AD_MARGIN.left}
                          y1={zeroY}
                          x2={AD_MARGIN.left + AD_INNER_WIDTH}
                          y2={zeroY}
                          stroke="rgba(255,255,255,0.7)"
                          strokeWidth="2"
                        />

                        {/* Y-axis labels */}
                        {yTicks.map((tick) => (
                          <text
                            key={`ad-ylabel-${tick}`}
                            x={AD_MARGIN.left - 10}
                            y={adYScale(tick)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fill="rgba(255,255,255,0.7)"
                            fontSize="11"
                          >
                            {tick > 0 ? '+' : ''}{tick}
                          </text>
                        ))}

                        {/* Candlesticks */}
                        {adCandles.map((candle) => {
                          const index = getCandleIndex(candle.time, spTimeframe)
                          const x = adXScale(index)
                          const isGreen = candle.close >= candle.open
                          const color = isGreen ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'

                          const bodyTop = adYScale(Math.max(candle.open, candle.close))
                          const bodyBottom = adYScale(Math.min(candle.open, candle.close))
                          const bodyHeight = Math.max(1, bodyBottom - bodyTop)

                          const wickTop = adYScale(candle.high)
                          const wickBottom = adYScale(candle.low)

                          const bodyWidth = Math.max(2, candleWidth * 0.7)

                          return (
                            <g key={`candle-${candle.time}`}>
                              {/* Wick (high-low line) */}
                              <line
                                x1={x}
                                y1={wickTop}
                                x2={x}
                                y2={wickBottom}
                                stroke={color}
                                strokeWidth="1"
                              />
                              {/* Body (open-close rectangle) */}
                              <rect
                                x={x - bodyWidth / 2}
                                y={bodyTop}
                                width={bodyWidth}
                                height={bodyHeight}
                                fill={color}
                                stroke={color}
                                strokeWidth="1"
                              />
                            </g>
                          )
                        })}

                        {/* X-axis time labels */}
                        {xTimeLabels.map((label) => {
                          const index = getCandleIndex(label.military, spTimeframe)
                          return (
                            <text
                              key={`ad-xlabel-${label.military}`}
                              x={adXScale(index)}
                              y={AD_MARGIN.top + AD_INNER_HEIGHT + 20}
                              textAnchor="middle"
                              fill="rgba(255,255,255,0.7)"
                              fontSize="10"
                            >
                              {label.display}
                            </text>
                          )
                        })}

                        {/* Current value label */}
                        {latestCandle && (
                          <text
                            x={AD_MARGIN.left + AD_INNER_WIDTH - 10}
                            y={AD_MARGIN.top + 20}
                            textAnchor="end"
                            fill={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
                            fontSize="16"
                            fontWeight="bold"
                          >
                            {latestValue > 0 ? '+' : ''}{latestValue}
                          </text>
                        )}

                        {/* Y-axis title */}
                        <text
                          x={AD_MARGIN.left - 50}
                          y={AD_MARGIN.top + AD_INNER_HEIGHT / 2}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.7)"
                          fontSize="12"
                          transform={`rotate(-90, ${AD_MARGIN.left - 50}, ${AD_MARGIN.top + AD_INNER_HEIGHT / 2})`}
                        >
                          Advances - Declines
                        </text>

                        {/* Summary stats */}
                        {latestCandle && (
                          <>
                            <text
                              x={AD_MARGIN.left + 10}
                              y={AD_MARGIN.top + 15}
                              fill="rgb(34, 197, 94)"
                              fontSize="12"
                            >
                              Advances: {latestCandle.advances}
                            </text>
                            <text
                              x={AD_MARGIN.left + 10}
                              y={AD_MARGIN.top + 30}
                              fill="rgb(239, 68, 68)"
                              fontSize="12"
                            >
                              Declines: {latestCandle.declines}
                            </text>
                          </>
                        )}
                      </>
                    )
                  })()}
                </svg>
              )}

              {/* NYSE Advance-Decline Candlestick Chart */}
              <div className="flex items-center justify-center gap-4 mt-8 mb-4">
                <h2 className="text-xl font-bold text-white">
                  NYSE Advance-Decline
                </h2>
                <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                  {TIMEFRAME_OPTIONS.map((tf) => (
                    <button
                      key={`nyse-${tf}`}
                      onClick={() => setNyseTimeframe(tf)}
                      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                        nyseTimeframe === tf
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {tf}m
                    </button>
                  ))}
                </div>
              </div>

              {nyseLoading && nyseCandles.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center">
                  <div className="text-gray-400">Loading NYSE advance-decline data...</div>
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${AD_CHART_WIDTH} ${AD_CHART_HEIGHT}`}
                  className="w-full h-auto border border-gray-700 rounded-lg"
                  style={{ maxWidth: '700px', margin: '0 auto', display: 'block' }}
                >
                  {(() => {
                    // Fixed y-axis range: -2000 to +2000 (NYSE has ~2,971 stocks)
                    const yMin = -2000
                    const yMax = 2000

                    // X scale based on fixed trading day
                    const totalCandles = getTotalCandles(nyseTimeframe)
                    const candleWidth = AD_INNER_WIDTH / totalCandles
                    const nyseXScale = (index: number) => {
                      return AD_MARGIN.left + (index * candleWidth) + (candleWidth / 2)
                    }

                    const nyseYScale = (value: number) => {
                      return AD_MARGIN.top + AD_INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * AD_INNER_HEIGHT
                    }

                    const zeroY = nyseYScale(0)

                    // Fixed y-axis ticks: -2000, -1000, 0, +1000, +2000
                    const yTicks = [-2000, -1000, 0, 1000, 2000]

                    // X-axis time labels (every hour from 9:30 to 4:00) in 12-hour format
                    const xTimeLabels = [
                      { display: '9:30', military: '09:30' },
                      { display: '10:00', military: '10:00' },
                      { display: '10:30', military: '10:30' },
                      { display: '11:00', military: '11:00' },
                      { display: '11:30', military: '11:30' },
                      { display: '12:00', military: '12:00' },
                      { display: '12:30', military: '12:30' },
                      { display: '1:00', military: '13:00' },
                      { display: '1:30', military: '13:30' },
                      { display: '2:00', military: '14:00' },
                      { display: '2:30', military: '14:30' },
                      { display: '3:00', military: '15:00' },
                      { display: '3:30', military: '15:30' },
                      { display: '4:00', military: '16:00' },
                    ]

                    const latestCandle = nyseCandles.length > 0 ? nyseCandles[nyseCandles.length - 1] : null
                    const latestValue = latestCandle ? latestCandle.close : 0
                    const isPositive = latestValue >= 0

                    return (
                      <>
                        {/* Horizontal grid lines */}
                        {yTicks.map((tick) => (
                          <line
                            key={`nyse-grid-${tick}`}
                            x1={AD_MARGIN.left}
                            y1={nyseYScale(tick)}
                            x2={AD_MARGIN.left + AD_INNER_WIDTH}
                            y2={nyseYScale(tick)}
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth={1}
                            strokeDasharray="4,4"
                          />
                        ))}

                        {/* Zero line - prominent horizontal line at y=0 */}
                        <line
                          x1={AD_MARGIN.left}
                          y1={zeroY}
                          x2={AD_MARGIN.left + AD_INNER_WIDTH}
                          y2={zeroY}
                          stroke="rgba(255,255,255,0.7)"
                          strokeWidth="2"
                        />

                        {/* Y-axis labels */}
                        {yTicks.map((tick) => (
                          <text
                            key={`nyse-ylabel-${tick}`}
                            x={AD_MARGIN.left - 10}
                            y={nyseYScale(tick)}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fill="rgba(255,255,255,0.7)"
                            fontSize="11"
                          >
                            {tick > 0 ? '+' : ''}{tick}
                          </text>
                        ))}

                        {/* Candlesticks */}
                        {nyseCandles.map((candle) => {
                          const index = getCandleIndex(candle.time, nyseTimeframe)
                          const x = nyseXScale(index)
                          const isGreen = candle.close >= candle.open
                          const color = isGreen ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'

                          const bodyTop = nyseYScale(Math.max(candle.open, candle.close))
                          const bodyBottom = nyseYScale(Math.min(candle.open, candle.close))
                          const bodyHeight = Math.max(1, bodyBottom - bodyTop)

                          const wickTop = nyseYScale(candle.high)
                          const wickBottom = nyseYScale(candle.low)

                          const bodyWidth = Math.max(2, candleWidth * 0.7)

                          return (
                            <g key={`nyse-candle-${candle.time}`}>
                              {/* Wick (high-low line) */}
                              <line
                                x1={x}
                                y1={wickTop}
                                x2={x}
                                y2={wickBottom}
                                stroke={color}
                                strokeWidth="1"
                              />
                              {/* Body (open-close rectangle) */}
                              <rect
                                x={x - bodyWidth / 2}
                                y={bodyTop}
                                width={bodyWidth}
                                height={bodyHeight}
                                fill={color}
                                stroke={color}
                                strokeWidth="1"
                              />
                            </g>
                          )
                        })}

                        {/* X-axis time labels */}
                        {xTimeLabels.map((label) => {
                          const index = getCandleIndex(label.military, nyseTimeframe)
                          return (
                            <text
                              key={`nyse-xlabel-${label.military}`}
                              x={nyseXScale(index)}
                              y={AD_MARGIN.top + AD_INNER_HEIGHT + 20}
                              textAnchor="middle"
                              fill="rgba(255,255,255,0.7)"
                              fontSize="10"
                            >
                              {label.display}
                            </text>
                          )
                        })}

                        {/* Current value label */}
                        {latestCandle && (
                          <text
                            x={AD_MARGIN.left + AD_INNER_WIDTH - 10}
                            y={AD_MARGIN.top + 20}
                            textAnchor="end"
                            fill={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
                            fontSize="16"
                            fontWeight="bold"
                          >
                            {latestValue > 0 ? '+' : ''}{latestValue}
                          </text>
                        )}

                        {/* Y-axis title */}
                        <text
                          x={AD_MARGIN.left - 50}
                          y={AD_MARGIN.top + AD_INNER_HEIGHT / 2}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.7)"
                          fontSize="12"
                          transform={`rotate(-90, ${AD_MARGIN.left - 50}, ${AD_MARGIN.top + AD_INNER_HEIGHT / 2})`}
                        >
                          Advances - Declines
                        </text>

                        {/* Summary stats */}
                        {latestCandle && (
                          <>
                            <text
                              x={AD_MARGIN.left + 10}
                              y={AD_MARGIN.top + 15}
                              fill="rgb(34, 197, 94)"
                              fontSize="12"
                            >
                              Advances: {latestCandle.advances}
                            </text>
                            <text
                              x={AD_MARGIN.left + 10}
                              y={AD_MARGIN.top + 30}
                              fill="rgb(239, 68, 68)"
                              fontSize="12"
                            >
                              Declines: {latestCandle.declines}
                            </text>
                          </>
                        )}
                      </>
                    )
                  })()}
                </svg>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
