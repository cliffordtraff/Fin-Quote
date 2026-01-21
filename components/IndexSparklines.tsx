'use client'

import { useRef, useEffect } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'

interface IndexSparklinesProps {
  indices: SparklineIndexData[]
}

interface SparklineCardProps {
  index: SparklineIndexData
}

function SparklineCard({ index }: SparklineCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !index.priceHistory || index.priceHistory.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Setup canvas for retina
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height)

    const prices = index.priceHistory
    const timestamps = index.priceTimestamps || []
    const todayOHLCData = index.todayOHLC || []
    const previousClose = index.previousClose

    // Include previousClose and today's OHLC highs/lows in min/max calculation
    const todayHighs = todayOHLCData.map(c => c.high)
    const todayLows = todayOHLCData.map(c => c.low)
    const allPrices = [
      ...prices,
      ...todayHighs,
      ...todayLows,
      ...(previousClose ? [previousClose] : [])
    ]
    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    const priceRange = maxPrice - minPrice || 1

    // Chart dimensions with padding (extra bottom padding for labels)
    const padding = 4
    const bottomPadding = 26 // Extra space for x-axis labels (2 lines for "Prev Open")
    const chartWidth = rect.width - padding * 2
    const chartHeight = rect.height - padding - bottomPadding

    // Draw previous close reference line (dashed horizontal line)
    if (previousClose !== null) {
      const prevCloseY = padding + ((maxPrice - previousClose) / priceRange) * chartHeight

      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])

      ctx.beginPath()
      ctx.moveTo(padding, prevCloseY)
      ctx.lineTo(padding + chartWidth, prevCloseY)
      ctx.stroke()

      // Reset line dash
      ctx.setLineDash([])
    }

    // Draw sparkline
    const todayOHLC = index.todayOHLC || []
    const totalDataPoints = prices.length + todayOHLC.length

    if (prices.length > 0 && todayOHLC.length > 0) {
      // Draw yesterday's data as a line (dimmer, thinner)
      ctx.beginPath()
      ctx.strokeStyle = isDark ? '#4b5563' : '#9ca3af'
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (let i = 0; i < prices.length; i++) {
        const x = padding + (i / (totalDataPoints - 1)) * chartWidth
        const y = padding + ((maxPrice - prices[i]) / priceRange) * chartHeight

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()

      // Draw today's data as candlesticks
      const todayStartX = padding + (prices.length / (totalDataPoints - 1)) * chartWidth
      const todayWidth = chartWidth - todayStartX + padding
      const candleWidth = todayWidth / todayOHLC.length
      const bodyWidth = Math.max(candleWidth * 0.7, 2)

      todayOHLC.forEach((candle, i) => {
        const x = todayStartX + (i + 0.5) * candleWidth
        const isGreen = candle.close >= candle.open

        const openY = padding + ((maxPrice - candle.open) / priceRange) * chartHeight
        const closeY = padding + ((maxPrice - candle.close) / priceRange) * chartHeight
        const highY = padding + ((maxPrice - candle.high) / priceRange) * chartHeight
        const lowY = padding + ((maxPrice - candle.low) / priceRange) * chartHeight

        const color = isGreen
          ? (isDark ? '#22c55e' : '#16a34a')
          : (isDark ? '#ef4444' : '#dc2626')

        // Draw wick
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.moveTo(x, highY)
        ctx.lineTo(x, lowY)
        ctx.stroke()

        // Draw body
        ctx.fillStyle = color
        const bodyTop = Math.min(openY, closeY)
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1)
        ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight)
      })
    } else {
      // No today/yesterday split, draw everything as a line
      ctx.beginPath()
      ctx.strokeStyle = isDark ? '#6b7280' : '#374151'
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      prices.forEach((price, i) => {
        const x = padding + (i / (prices.length - 1)) * chartWidth
        const y = padding + ((maxPrice - price) / priceRange) * chartHeight

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })

      ctx.stroke()
    }

    // Draw time labels with tick marks
    if (timestamps.length > 0 && todayOHLC.length > 0) {
      ctx.font = '9px sans-serif'
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
      ctx.lineWidth = 1

      const tickTop = chartHeight + padding
      const tickBottom = tickTop + 5

      // Draw "Open" tick and label for today (at first candle position)
      const todayStartX = padding + (prices.length / (totalDataPoints - 1)) * chartWidth
      const todayWidth = chartWidth - todayStartX + padding
      const candleWidth = todayWidth / todayOHLC.length
      const x = todayStartX + 0.5 * candleWidth

      ctx.beginPath()
      ctx.moveTo(x, tickTop)
      ctx.lineTo(x, tickBottom)
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.fillText('Open', x, rect.height - 4)
    }
  }, [index.priceHistory, index.priceTimestamps, index.todayOHLC, index.previousClose, isDark])

  const isPositive = index.priceChange >= 0
  const changeColor = isPositive
    ? 'text-green-700 dark:text-green-500'
    : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex flex-col items-center pt-1 pb-0 px-3 flex-1">
      <div className="flex items-baseline gap-14 mb-2">
        <span className="text-sm font-semibold tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {index.name}
        </span>
        <span className={`text-xs font-medium whitespace-nowrap ${changeColor}`}>
          {isPositive ? '+' : ''}{index.priceChange.toFixed(2)} ({isPositive ? '+' : ''}{index.priceChangePercent.toFixed(2)}%)
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '115px' }}
      />
    </div>
  )
}

export default function IndexSparklines({ indices }: IndexSparklinesProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[rgb(28,28,28)] pt-2 pb-2 px-4" style={{ width: '1360px' }}>
      <div className="flex gap-4 justify-start">
        {indices.map((index) => (
          <SparklineCard
            key={index.symbol}
            index={index}
          />
        ))}
      </div>
    </div>
  )
}
