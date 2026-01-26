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
    if (!canvas) return

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

    const yesterdayOHLC = index.yesterdayOHLC || []
    const todayOHLC = index.todayOHLC || []
    const previousClose = index.previousClose

    // Include all OHLC highs/lows in min/max calculation
    const yesterdayHighs = yesterdayOHLC.map(c => c.high)
    const yesterdayLows = yesterdayOHLC.map(c => c.low)
    const todayHighs = todayOHLC.map(c => c.high)
    const todayLows = todayOHLC.map(c => c.low)
    const allPrices = [
      ...yesterdayHighs,
      ...yesterdayLows,
      ...todayHighs,
      ...todayLows,
      ...(previousClose ? [previousClose] : [])
    ]

    if (allPrices.length === 0) return

    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    const priceRange = maxPrice - minPrice || 1

    // Chart dimensions with padding (extra bottom padding for labels)
    const padding = 4
    const bottomPadding = 38 // Extra space for x-axis labels (bracket + hours + percentage)
    const chartWidth = rect.width - padding * 2
    const chartHeight = rect.height - padding - bottomPadding


    // Draw candlesticks for both days
    const totalCandles = yesterdayOHLC.length + todayOHLC.length
    if (totalCandles === 0) return

    // Draw dashed gridlines
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])

    // Horizontal gridlines (4 lines)
    const horizontalLines = 4
    for (let i = 1; i < horizontalLines; i++) {
      const y = padding + (i / horizontalLines) * chartHeight
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(padding + chartWidth, y)
      ctx.stroke()
    }

    // Vertical gridlines (6 evenly spaced - 3 for yesterday, 3 for today)
    const verticalLines = 6
    for (let i = 1; i < verticalLines; i++) {
      const x = padding + (i / verticalLines) * chartWidth
      ctx.beginPath()
      ctx.moveTo(x, padding)
      ctx.lineTo(x, padding + chartHeight)
      ctx.stroke()
    }

    // Reset line dash for candlesticks
    ctx.setLineDash([])

    // Helper function to draw candlesticks
    const drawCandlesticks = (
      ohlcData: typeof yesterdayOHLC,
      startIndex: number,
      totalCandles: number,
      dimmed: boolean = false
    ) => {
      const candleWidth = chartWidth / totalCandles
      const bodyWidth = Math.max(candleWidth * 0.7, 2)

      ohlcData.forEach((candle, i) => {
        const x = padding + ((startIndex + i + 0.5) / totalCandles) * chartWidth
        const isGreen = candle.close >= candle.open

        const openY = padding + ((maxPrice - candle.open) / priceRange) * chartHeight
        const closeY = padding + ((maxPrice - candle.close) / priceRange) * chartHeight
        const highY = padding + ((maxPrice - candle.high) / priceRange) * chartHeight
        const lowY = padding + ((maxPrice - candle.low) / priceRange) * chartHeight

        let color: string
        if (dimmed) {
          // Dimmed colors for yesterday
          color = isGreen
            ? (isDark ? '#166534' : '#22c55e')  // darker green
            : (isDark ? '#991b1b' : '#ef4444')  // darker red
        } else {
          // Bright colors for today
          color = isGreen
            ? (isDark ? '#22c55e' : '#16a34a')
            : (isDark ? '#ef4444' : '#dc2626')
        }

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
    }

    // Draw yesterday's candlesticks (dimmed)
    if (yesterdayOHLC.length > 0) {
      drawCandlesticks(yesterdayOHLC, 0, totalCandles, true)
    }

    // Draw today's candlesticks (bright)
    if (todayOHLC.length > 0) {
      drawCandlesticks(todayOHLC, yesterdayOHLC.length, totalCandles, false)
    }

    // Draw bracket-style x-axis labels with hourly times below
    if (yesterdayOHLC.length > 0 && todayOHLC.length > 0) {
      ctx.font = '10px sans-serif'
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1

      const bracketTop = chartHeight + padding + 2
      const bracketHeight = 6
      const bracketBottom = bracketTop + bracketHeight
      const timeY = bracketBottom + 10
      const percentY = timeY + 14

      // Calculate the dividing point between yesterday and today
      const todayStartX = padding + (yesterdayOHLC.length / totalCandles) * chartWidth
      const gapWidth = 4 // Small gap between the two brackets

      // Yesterday bracket (left side)
      const yesterdayLeft = padding
      const yesterdayRight = todayStartX - gapWidth / 2
      const yesterdayCenterX = (yesterdayLeft + yesterdayRight) / 2

      ctx.beginPath()
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'
      ctx.moveTo(yesterdayLeft, bracketTop)
      ctx.lineTo(yesterdayLeft, bracketBottom)
      ctx.lineTo(yesterdayRight, bracketBottom)
      ctx.lineTo(yesterdayRight, bracketTop)
      ctx.stroke()

      // Today bracket (right side)
      const todayLeft = todayStartX + gapWidth / 2
      const todayRight = padding + chartWidth
      const todayCenterX = (todayLeft + todayRight) / 2

      ctx.beginPath()
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'
      ctx.moveTo(todayLeft, bracketTop)
      ctx.lineTo(todayLeft, bracketBottom)
      ctx.lineTo(todayRight, bracketBottom)
      ctx.lineTo(todayRight, bracketTop)
      ctx.stroke()

      // Draw hourly time labels for yesterday (below bracket)
      const hoursToShowYesterday = ['10', '12', '14'] // Show 10am, 12pm, 2pm for yesterday

      for (const targetHour of hoursToShowYesterday) {
        const matchIdx = yesterdayOHLC.findIndex(candle => {
          const timePart = candle.date.split(' ')[1]
          if (!timePart) return false
          const hour = timePart.split(':')[0]
          const minute = timePart.split(':')[1]
          return hour === targetHour && minute === '00'
        })

        if (matchIdx !== -1) {
          const x = padding + ((matchIdx + 0.5) / totalCandles) * chartWidth
          ctx.textAlign = 'center'
          ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
          const hourNum = parseInt(targetHour)
          const displayHour = hourNum > 12 ? hourNum - 12 : hourNum
          ctx.fillText(`${displayHour}${hourNum >= 12 ? 'p' : 'a'}`, x, timeY)
        }
      }

      // Draw hourly time labels for today (below bracket)
      const hoursToShowToday = ['10', '12', '14'] // Show 10am, 12pm, 2pm for today

      for (const targetHour of hoursToShowToday) {
        const matchIdx = todayOHLC.findIndex(candle => {
          const timePart = candle.date.split(' ')[1]
          if (!timePart) return false
          const hour = timePart.split(':')[0]
          const minute = timePart.split(':')[1]
          return hour === targetHour && minute === '00'
        })

        if (matchIdx !== -1) {
          const x = padding + ((yesterdayOHLC.length + matchIdx + 0.5) / totalCandles) * chartWidth
          ctx.textAlign = 'center'
          ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
          const hourNum = parseInt(targetHour)
          const displayHour = hourNum > 12 ? hourNum - 12 : hourNum
          ctx.fillText(`${displayHour}${hourNum >= 12 ? 'p' : 'a'}`, x, timeY)
        }
      }

      // Yesterday percentage (below time labels)
      const yesterdayPct = index.yesterdayChangePercent
      if (yesterdayPct !== null) {
        const yesterdayIsPositive = yesterdayPct >= 0
        ctx.textAlign = 'center'
        ctx.fillStyle = yesterdayIsPositive
          ? (isDark ? '#22c55e' : '#16a34a')
          : (isDark ? '#ef4444' : '#dc2626')
        ctx.fillText(
          `${yesterdayIsPositive ? '+' : ''}${yesterdayPct.toFixed(2)}%`,
          yesterdayCenterX,
          percentY
        )
      }

      // Today percentage (below time labels)
      const todayPct = index.priceChangePercent
      const todayIsPositive = todayPct >= 0
      ctx.textAlign = 'center'
      ctx.fillStyle = todayIsPositive
        ? (isDark ? '#22c55e' : '#16a34a')
        : (isDark ? '#ef4444' : '#dc2626')
      ctx.fillText(
        `${todayIsPositive ? '+' : ''}${todayPct.toFixed(2)}%`,
        todayCenterX,
        percentY
      )
    }
  }, [index.yesterdayOHLC, index.todayOHLC, index.previousClose, index.yesterdayChangePercent, index.priceChangePercent, isDark])

  return (
    <div className="flex flex-col items-center pt-2 pb-1 px-3 flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[rgb(33,33,33)]">
      <div className="flex items-baseline justify-center mb-2">
        <span className="text-sm font-semibold tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {index.name}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '140px' }}
      />
    </div>
  )
}

export default function IndexSparklines({ indices }: IndexSparklinesProps) {
  return (
    <div className="pt-2 pb-2">
      <div className="flex gap-4 w-full">
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
