/**
 * SimpleCanvasChart.tsx
 *
 * A custom candlestick chart component built with HTML5 Canvas API.
 * This component renders intraday stock price data with candlesticks, gridlines, and axis labels.
 *
 * Key Features:
 * - Draws candlestick charts (green for up days, red for down days)
 * - Dotted gridlines (horizontal and vertical)
 * - Y-axis price labels with $1 intervals
 * - X-axis time labels at hourly intervals
 * - Supports both light and dark themes
 * - Optimized for retina displays
 */

'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '@/components/ThemeProvider'

// Type definition for candlestick data
// Each candle contains: date/time, open price, high price, low price, close price
interface SimpleCanvasChartProps {
  data: Array<{ date: string; open: number; high: number; low: number; close: number }>
  yAxisInterval?: number  // Optional: custom interval for y-axis labels (e.g., 10, 100, 1000)
}

export default function SimpleCanvasChart({ data, yAxisInterval }: SimpleCanvasChartProps) {
  // React ref to access the canvas DOM element
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Get current theme (light/dark) from ThemeProvider
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // useEffect runs whenever data or theme changes
  // This is where all the canvas drawing happens
  useEffect(() => {
    // Get reference to canvas element
    const canvas = canvasRef.current

    // Exit early if canvas doesn't exist or there's no data
    if (!canvas || !data || data.length === 0) return

    // Get 2D drawing context (the API for drawing on canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ====================
    // CANVAS SETUP
    // ====================

    // Set canvas size to match its display size
    // Multiply by devicePixelRatio for sharp rendering on retina displays
    const dpr = window.devicePixelRatio || 1  // Usually 2 on retina displays
    const rect = canvas.getBoundingClientRect()  // Get actual display size
    canvas.width = rect.width * dpr   // Set internal width (e.g., 1000px * 2 = 2000px)
    canvas.height = rect.height * dpr // Set internal height (e.g., 400px * 2 = 800px)
    ctx.scale(dpr, dpr)  // Scale drawing operations to match (so we can still use 1000x400 coordinates)

    // Clear any previous drawing
    ctx.clearRect(0, 0, rect.width, rect.height)

    // ====================
    // COLOR SCHEME
    // ====================

    // Define colors based on current theme (dark/light mode)
    const bgColor = isDark ? '#111827' : '#f9fafb'    // Background matches page
    const gridColor = isDark ? '#374151' : '#e5e7eb'  // Gridlines
    const upColor = '#10b981'   // Green for candles where close > open (price went up)
    const downColor = '#ef4444' // Red for candles where close < open (price went down)
    const textColor = isDark ? '#9ca3af' : '#6b7280'  // Axis labels

    // Fill the entire canvas with background color
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, rect.width, rect.height)

    // ====================
    // PRICE RANGE CALCULATION
    // ====================

    // Extract all high and low prices from the data
    const prices = data.flatMap(d => [d.high, d.low])

    // Find the highest and lowest prices in the dataset
    const maxPrice = Math.max(...prices)  // e.g., $273
    const minPrice = Math.min(...prices)  // e.g., $266

    // Calculate the total price range
    const priceRange = maxPrice - minPrice  // e.g., $7

    // Add 10% padding above/below so candles don't touch the edges
    const padding = priceRange * 0.1  // e.g., $0.70

    // ====================
    // CHART DIMENSIONS
    // ====================

    // Define the drawable area for the chart (leaving room for labels)
    const chartTop = 10                    // Leave 10px at top
    const chartBottom = rect.height - 20   // Leave 20px at bottom for x-axis labels
    const chartHeight = chartBottom - chartTop

    const chartLeft = 5                    // Leave 5px on left
    const chartRight = rect.width - 45     // Leave 45px on right for y-axis labels
    const chartWidth = chartRight - chartLeft

    // Calculate width of each candlestick
    // Divide available width by number of candles, subtract 2px for spacing
    const candleWidth = Math.max(2, chartWidth / data.length - 2)

    // ====================
    // DRAW HORIZONTAL GRIDLINES
    // ====================

    ctx.strokeStyle = gridColor  // Set line color
    ctx.lineWidth = 1            // Set line thickness
    ctx.setLineDash([2, 3])      // Set dotted pattern: 2px line, 3px gap

    // Draw 5 horizontal lines (excluding top and bottom edges) for 7 total positions
    // This matches the number of vertical gridlines (7 hourly marks)
    const numHorizontalLines = 7 // Total positions including edges
    for (let i = 1; i < numHorizontalLines - 1; i++) {
      // Calculate y position for this gridline
      // Divides chart into 6 equal sections vertically
      const y = chartTop + (chartHeight / (numHorizontalLines - 1)) * i

      ctx.beginPath()           // Start a new path
      ctx.moveTo(chartLeft, y)  // Move to left edge
      ctx.lineTo(chartRight, y) // Draw line to right edge
      ctx.stroke()              // Actually draw the line
    }

    // ====================
    // DRAW VERTICAL GRIDLINES (at hourly intervals)
    // ====================

    // Find candles closest to key times: 9:30 AM, 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 3 PM, 4 PM
    const targetTimes = [
      { hour: 9, minute: 30 },  // Market open
      { hour: 10, minute: 0 },
      { hour: 11, minute: 0 },
      { hour: 12, minute: 0 },
      { hour: 13, minute: 0 },  // 1 PM
      { hour: 14, minute: 0 },  // 2 PM
      { hour: 15, minute: 0 },  // 3 PM
    ]

    // For each target time, find the closest candle
    targetTimes.forEach(target => {
      let closestIndex = -1
      let smallestDiff = Infinity

      data.forEach((candle, index) => {
        const date = new Date(candle.date)
        const candleMinutesFromMidnight = date.getHours() * 60 + date.getMinutes()
        const targetMinutesFromMidnight = target.hour * 60 + target.minute

        const diff = Math.abs(candleMinutesFromMidnight - targetMinutesFromMidnight)

        if (diff < smallestDiff) {
          smallestDiff = diff
          closestIndex = index
        }
      })

      // Draw gridline at the closest candle
      if (closestIndex !== -1) {
        const x = chartLeft + (closestIndex * (chartWidth / data.length)) + candleWidth / 2
        ctx.beginPath()
        ctx.moveTo(x, chartTop)
        ctx.lineTo(x, chartBottom)
        ctx.stroke()
      }
    })

    // Always draw gridline at last candle (market close)
    const lastX = chartLeft + ((data.length - 1) * (chartWidth / data.length)) + candleWidth / 2
    ctx.beginPath()
    ctx.moveTo(lastX, chartTop)
    ctx.lineTo(lastX, chartBottom)
    ctx.stroke()

    // Reset line dash (turn off dotted pattern for candlesticks)
    ctx.setLineDash([])

    // ====================
    // DRAW CANDLESTICKS
    // ====================

    // Loop through each candle and draw it
    data.forEach((candle, index) => {
      // Calculate x position (center of this candle)
      const x = chartLeft + (index * (chartWidth / data.length)) + candleWidth / 2

      // Convert price values to y-coordinates on canvas
      // Canvas y-coordinates go DOWN from top, so we subtract from chartBottom
      // Formula: normalize price to 0-1 range, multiply by chart height, subtract from bottom

      // Open price y-coordinate
      const openY = chartBottom - ((candle.open - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      // Close price y-coordinate
      const closeY = chartBottom - ((candle.close - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      // High price y-coordinate (highest point of the wick)
      const highY = chartBottom - ((candle.high - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      // Low price y-coordinate (lowest point of the wick)
      const lowY = chartBottom - ((candle.low - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      // Determine if this is an "up" candle (close >= open)
      const isUp = candle.close >= candle.open

      // Choose color based on direction (green for up, red for down)
      const color = isUp ? upColor : downColor

      // Draw the wick (thin vertical line from high to low)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, highY)  // Start at high price
      ctx.lineTo(x, lowY)   // Draw to low price
      ctx.stroke()          // Actually draw the line

      // Draw the body (thick rectangle from open to close)
      ctx.fillStyle = color

      // Body top is whichever is higher (open or close)
      const bodyTop = Math.min(openY, closeY)

      // Body height is distance between open and close (minimum 2px so it's visible)
      const bodyHeight = Math.max(2, Math.abs(closeY - openY))

      // Draw filled rectangle centered on x position
      ctx.fillRect(
        x - candleWidth / 2,  // Left edge (half candle width to the left)
        bodyTop,              // Top edge
        candleWidth,          // Width
        bodyHeight            // Height
      )
    })

    // ====================
    // DRAW Y-AXIS PRICE LABELS
    // ====================

    ctx.fillStyle = textColor       // Set text color
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'     // Set font
    ctx.textAlign = 'left'          // Align text to the left

    // Calculate price range for labels
    const priceMin = minPrice - padding  // Lowest price on chart
    const priceMax = maxPrice + padding  // Highest price on chart
    const totalRange = priceMax - priceMin
    const interval = yAxisInterval || 10  // Use custom interval or default to $10

    // Round down to nearest interval for clean starting point
    const niceMin = Math.floor(priceMin / interval) * interval

    // Draw 6 price labels (skip the lowest one)
    const numPriceLabels = 7
    for (let i = 0; i < numPriceLabels - 1; i++) {  // Skip last label (i=6, the lowest)
      // Calculate price for this label (counting down from top)
      // i=0 -> highest price, i=5 -> second lowest price
      const price = niceMin + (interval * (numPriceLabels - 1 - i))

      // Align label with gridline position
      // Gridlines are at chartTop + (chartHeight / 6) * i
      const y = chartTop + (chartHeight / (numPriceLabels - 1)) * i

      // Draw the price label (e.g., "270")
      // Position it 2px to the right of the chart, 3px below the gridline
      ctx.fillText(`${Math.round(price)}`, chartRight + 2, y + 3)
    }

    // ====================
    // DRAW X-AXIS TIME/DATE LABELS
    // ====================

    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'  // Set font
    ctx.textAlign = 'center'     // Center-align text

    if (data.length > 0) {
      // Check if this is intraday data (all candles from same day) or daily data (different days)
      const firstDate = new Date(data[0].date)
      const lastDate = new Date(data[data.length - 1].date)
      const isIntraday = firstDate.toDateString() === lastDate.toDateString()

      if (isIntraday) {
        // ====================
        // INTRADAY: Show time labels (10AM, 11AM, 12PM, etc.)
        // ====================

        // Target times for labels (no label for 9:30 AM, just gridline)
        const labelTimes = [
          { hour: 10, minute: 0, label: '10AM' },
          { hour: 11, minute: 0, label: '11AM' },
          { hour: 12, minute: 0, label: '12PM' },
          { hour: 13, minute: 0, label: '1PM' },
          { hour: 14, minute: 0, label: '2PM' },
          { hour: 15, minute: 0, label: '3PM' },
        ]

        const hourLabels = []

        // Find candles closest to each target time
        labelTimes.forEach(target => {
          let closestIndex = -1
          let smallestDiff = Infinity

          data.forEach((candle, index) => {
            const date = new Date(candle.date)
            const candleMinutesFromMidnight = date.getHours() * 60 + date.getMinutes()
            const targetMinutesFromMidnight = target.hour * 60 + target.minute

            const diff = Math.abs(candleMinutesFromMidnight - targetMinutesFromMidnight)

            if (diff < smallestDiff) {
              smallestDiff = diff
              closestIndex = index
            }
          })

          if (closestIndex !== -1) {
            const x = chartLeft + (closestIndex * (chartWidth / data.length)) + candleWidth / 2
            hourLabels.push({ x, label: target.label })
          }
        })

        // Always add 4PM label at the end
        const lastX = chartLeft + ((data.length - 1) * (chartWidth / data.length)) + candleWidth / 2
        hourLabels.push({ x: lastX, label: '4PM' })

        // Draw all the time labels
        hourLabels.forEach(({ x, label }) => {
          // Position label 5px from bottom of canvas
          ctx.fillText(label, x, rect.height - 5)
        })

      } else {
        // ====================
        // DAILY: Show date labels (Nov 7, Nov 8, etc.)
        // ====================

        const numLabels = 5  // Show 5 evenly-spaced date labels

        for (let i = 0; i < numLabels; i++) {
          // Calculate which candle to show a label for
          // Spreads labels evenly across all data points
          const dataIndex = Math.floor((data.length - 1) * i / (numLabels - 1))
          const date = new Date(data[dataIndex].date)

          // Calculate x position (evenly spaced across chart)
          const x = chartLeft + (chartWidth * i / (numLabels - 1))

          // Format date as "Nov 7", "Nov 8", etc.
          const dateLabel = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          })

          // Draw the date label
          ctx.fillText(dateLabel, x, rect.height - 5)
        }
      }
    }

  }, [data, isDark])  // Re-run this effect when data or theme changes

  // ====================
  // RENDER
  // ====================

  return (
    <div className="w-full rounded" style={{ height: '170px' }}>
      <canvas
        ref={canvasRef}  // Connect React ref to this canvas element
        className="w-full h-full rounded"
        style={{ touchAction: 'auto', userSelect: 'none' }}
      />
    </div>
  )
}
