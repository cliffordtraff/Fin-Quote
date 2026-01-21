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
  labelIntervalMultiplier?: number  // Optional: multiplier for label interval (default: 2)
  previousClose?: number  // Optional: previous day's closing price for reference line
  currentPrice?: number   // Optional: current price to highlight on Y-axis
  maxCandleWidth?: number // Optional: maximum candle width in pixels (prevents stretching on wide charts)
  showYAxisLabels?: boolean // Optional: whether to show Y-axis price labels (default: true)
}

export default function SimpleCanvasChart({ data, yAxisInterval, labelIntervalMultiplier = 2, previousClose, currentPrice, maxCandleWidth, showYAxisLabels = true }: SimpleCanvasChartProps) {
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
    const bgColor = isDark ? 'rgb(33,33,33)' : '#f9fafb'    // Background matches page
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

    // Include previous close in price range calculation to ensure it's always visible
    if (previousClose !== undefined) {
      prices.push(previousClose)
    }

    // Include current price in price range calculation
    if (currentPrice !== undefined) {
      prices.push(currentPrice)
    }

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
    const chartRight = rect.width - 55     // Leave 55px on right for y-axis labels and current price pill
    const chartWidth = chartRight - chartLeft

    // ====================
    // CALCULATE CANDLE INTERVAL & FULL DAY RANGE
    // ====================

    // Determine candle interval (in minutes) from the data
    let candleIntervalMinutes = 1 // Default to 1-minute candles
    if (data.length >= 2) {
      const firstTime = new Date(data[0].date).getTime()
      const secondTime = new Date(data[1].date).getTime()
      candleIntervalMinutes = (secondTime - firstTime) / (1000 * 60)
    }

    // Check if this is daily data (interval > 12 hours = 720 minutes)
    const isDailyData = candleIntervalMinutes > 720

    // Calculate total expected candles
    let totalExpectedCandles: number
    if (isDailyData) {
      // For daily data, use the actual number of candles
      totalExpectedCandles = data.length
    } else {
      // For intraday data, calculate based on full trading day (9:30 AM to 4:00 PM = 390 minutes)
      const tradingDayMinutes = 390
      totalExpectedCandles = Math.ceil(tradingDayMinutes / candleIntervalMinutes)
    }

    // Calculate width of each candlestick
    // If maxCandleWidth is specified, cap the candle width to prevent stretching on wide charts
    const calculatedCandleWidth = Math.max(2, chartWidth / totalExpectedCandles - 2)
    const candleWidth = maxCandleWidth ? Math.min(calculatedCandleWidth, maxCandleWidth) : calculatedCandleWidth

    // ====================
    // CALCULATE PRICE LABEL POSITIONS (for gridlines and labels)
    // ====================

    // Calculate price range for labels - use actual data range with padding
    const priceMin = minPrice - padding  // Lowest price on chart
    const priceMax = maxPrice + padding  // Highest price on chart
    const totalRange = priceMax - priceMin

    // Dynamic interval selection based on price range
    // This adapts the Y-axis spacing based on intraday volatility
    // Each interval tier has both a max and min number of labels
    let labelInterval: number
    let maxLabels: number
    let minLabels: number

    if (yAxisInterval) {
      // If custom interval provided, use it with the multiplier
      labelInterval = yAxisInterval * labelIntervalMultiplier
      maxLabels = 6
      minLabels = 4
    } else {
      // Auto-select interval and max/min labels based on price range
      // For indices like NASDAQ (~23000-24000), SPX (~6000-7000), etc.
      if (totalRange <= 8) {
        // Very tight range (e.g., SPX intraday ~$5-8): $2 interval
        labelInterval = 2
        maxLabels = 5
        minLabels = 3
      } else if (totalRange <= 30) {
        // Tight range (e.g., SPX intraday ~$10-30): $5 interval
        labelInterval = 5
        maxLabels = 6
        minLabels = 3
      } else if (totalRange <= 80) {
        // Small range: $20 interval, 6 labels (min and max)
        labelInterval = 20
        maxLabels = 6
        minLabels = 6
      } else if (totalRange <= 150) {
        // Medium range: $50 interval, min 4, max 5 labels
        labelInterval = 50
        maxLabels = 5
        minLabels = 4
      } else if (totalRange <= 300) {
        // Larger range: $100 interval, min 4, max 5 labels
        labelInterval = 100
        maxLabels = 5
        minLabels = 4
      } else {
        // Very large range: $200 interval, min 4, max 4 labels
        labelInterval = 200
        maxLabels = 4
        minLabels = 4
      }
    }

    // Helper function to generate labels for a given interval
    const generateLabels = (interval: number, pMin: number, pMax: number, range: number): Array<{ price: number; y: number }> => {
      const nMin = Math.floor(pMin / interval) * interval
      const nMax = Math.ceil(pMax / interval) * interval
      const labels: Array<{ price: number; y: number }> = []

      for (let price = nMin; price <= nMax; price += interval) {
        const normalizedPosition = (pMax - price) / range
        const y = chartTop + (normalizedPosition * chartHeight)
        if (y >= chartTop && y <= chartBottom) {
          labels.push({ price, y })
        }
      }
      return labels
    }

    // Generate initial labels
    let priceLabels = generateLabels(labelInterval, priceMin, priceMax, totalRange)

    // If we don't have enough labels, try smaller intervals
    if (priceLabels.length < minLabels) {
      // Try progressively smaller intervals until we get enough labels
      const smallerIntervals = [100, 50, 20, 10, 5, 2, 1]
      for (const smallerInterval of smallerIntervals) {
        if (smallerInterval < labelInterval) {
          const newLabels = generateLabels(smallerInterval, priceMin, priceMax, totalRange)
          if (newLabels.length >= minLabels) {
            priceLabels = newLabels
            labelInterval = smallerInterval
            // Update maxLabels for the new interval tier
            if (smallerInterval === 20) maxLabels = 6
            else if (smallerInterval === 50) maxLabels = 5
            else maxLabels = 6
            break
          }
        }
      }
    }

    // If more than max labels, trim from top and bottom alternately to keep labels centered
    while (priceLabels.length > maxLabels) {
      // Remove from bottom (highest price, which is at start of array since y increases downward)
      priceLabels.shift()
      if (priceLabels.length > maxLabels) {
        // Remove from top (lowest price, which is at end of array)
        priceLabels.pop()
      }
    }

    // Gridlines removed for cleaner look

    // ====================
    // DRAW CANDLESTICKS
    // ====================

    // Market open time reference (9:30 AM)
    const marketOpenHour = 9
    const marketOpenMinute = 30

    // Check if we have multi-day intraday data (previous day + today with a gap)
    // Detect by looking for candles from different dates
    const uniqueDatesInData = [...new Set(data.map(c => c.date.split(' ')[0]))]
    const hasMultipleDays = !isDailyData && uniqueDatesInData.length > 1

    // For multi-day data, we need to calculate positions differently
    // Previous day candles (2pm-4pm = 12 slots) + gap (2 slot widths) + today candles (up to 39 slots)
    const gapSlots = hasMultipleDays ? 2 : 0
    const prevDaySlots = 12  // 2pm-4pm = 12 ten-minute slots
    const todaySlots = 39    // 9:30am-4pm = 39 ten-minute slots
    const totalSlotsWithGap = hasMultipleDays ? prevDaySlots + gapSlots + todaySlots : totalExpectedCandles

    // Recalculate candle width for multi-day layout
    const effectiveCandleWidth = hasMultipleDays
      ? Math.max(2, chartWidth / totalSlotsWithGap - 2)
      : candleWidth

    // Loop through each candle and draw it
    data.forEach((candle, index) => {
      let x: number

      if (isDailyData) {
        // For daily data, position candles evenly based on index
        x = chartLeft + (index * (chartWidth / totalExpectedCandles)) + effectiveCandleWidth / 2
      } else if (hasMultipleDays) {
        // For multi-day intraday data, position based on date and time
        const candleDateStr = candle.date.split(' ')[0]
        const candleDate = new Date(candle.date)
        const candleMinutesFromMidnight = candleDate.getHours() * 60 + candleDate.getMinutes()
        const marketOpenMinutes = marketOpenHour * 60 + marketOpenMinute
        const minutesSinceOpen = candleMinutesFromMidnight - marketOpenMinutes
        const timeSlot = Math.floor(minutesSinceOpen / candleIntervalMinutes)

        // Determine if this is previous day or today
        const isToday = candleDateStr === uniqueDatesInData[uniqueDatesInData.length - 1]

        if (isToday) {
          // Today's candles: position after the gap
          // Slot 0 (9:30am) should be at position prevDaySlots + gapSlots
          const adjustedSlot = prevDaySlots + gapSlots + timeSlot
          x = chartLeft + (adjustedSlot * (chartWidth / totalSlotsWithGap)) + effectiveCandleWidth / 2
        } else {
          // Previous day's candles: 2pm-4pm = slots 27-38
          // Map slot 27 to position 0, slot 38 to position 11
          const prevDayPosition = timeSlot - 27  // 27 = 2pm slot
          x = chartLeft + (prevDayPosition * (chartWidth / totalSlotsWithGap)) + effectiveCandleWidth / 2
        }
      } else {
        // For single-day intraday data, calculate candle position based on its actual time
        const candleDate = new Date(candle.date)
        const candleMinutesFromMidnight = candleDate.getHours() * 60 + candleDate.getMinutes()
        const marketOpenMinutes = marketOpenHour * 60 + marketOpenMinute
        const minutesSinceOpen = candleMinutesFromMidnight - marketOpenMinutes

        // Calculate which "slot" this candle belongs to
        const candleSlot = Math.floor(minutesSinceOpen / candleIntervalMinutes)

        // Calculate x position based on slot within full trading day
        x = chartLeft + (candleSlot * (chartWidth / totalExpectedCandles)) + effectiveCandleWidth / 2
      }

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
        x - effectiveCandleWidth / 2,  // Left edge (half candle width to the left)
        bodyTop,              // Top edge
        effectiveCandleWidth,          // Width
        bodyHeight            // Height
      )
    })

    // ====================
    // DRAW PREVIOUS CLOSE LINE
    // ====================

    if (previousClose !== undefined) {
      // Calculate y position for previous close
      const prevCloseY = chartBottom - ((previousClose - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      // Set line style: red color, dotted pattern
      ctx.strokeStyle = '#ef4444'  // Red color
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])  // 4px dash, 4px gap

      // Draw horizontal line from left to right
      ctx.beginPath()
      ctx.moveTo(chartLeft, prevCloseY)
      ctx.lineTo(chartRight, prevCloseY)
      ctx.stroke()

      // Reset line dash for other elements
      ctx.setLineDash([])
    }

    // ====================
    // DRAW Y-AXIS PRICE LABELS
    // ====================

    if (showYAxisLabels) {
      ctx.fillStyle = textColor       // Set text color
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'     // Set font
      ctx.textAlign = 'left'          // Align text to the left

      // Draw the price labels (using priceLabels array calculated earlier)
      priceLabels.forEach(({ price, y }) => {
        ctx.fillText(`${Math.round(price)}`, chartRight + 2, y + 3)
      })
    }

    // ====================
    // DRAW CURRENT PRICE LABEL (highlighted)
    // ====================

    if (currentPrice !== undefined) {
      // Calculate y position for current price
      const currentPriceY = chartBottom - ((currentPrice - minPrice + padding) / (priceRange + padding * 2)) * chartHeight

      if (currentPriceY >= chartTop && currentPriceY <= chartBottom) {
        // Format the price (show one decimal for precision)
        const priceText = currentPrice.toFixed(1)

        // Measure text width for background pill
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const textWidth = ctx.measureText(priceText).width

        // Draw background pill (rounded rectangle)
        const pillPadding = 3
        const pillHeight = 14
        const pillWidth = textWidth + pillPadding * 2
        const pillX = chartRight + 1
        const pillY = currentPriceY - pillHeight / 2

        // Draw rounded rectangle background (yellow for visibility)
        ctx.fillStyle = '#eab308'  // Yellow
        ctx.beginPath()
        const radius = 3
        ctx.moveTo(pillX + radius, pillY)
        ctx.lineTo(pillX + pillWidth - radius, pillY)
        ctx.quadraticCurveTo(pillX + pillWidth, pillY, pillX + pillWidth, pillY + radius)
        ctx.lineTo(pillX + pillWidth, pillY + pillHeight - radius)
        ctx.quadraticCurveTo(pillX + pillWidth, pillY + pillHeight, pillX + pillWidth - radius, pillY + pillHeight)
        ctx.lineTo(pillX + radius, pillY + pillHeight)
        ctx.quadraticCurveTo(pillX, pillY + pillHeight, pillX, pillY + pillHeight - radius)
        ctx.lineTo(pillX, pillY + radius)
        ctx.quadraticCurveTo(pillX, pillY, pillX + radius, pillY)
        ctx.closePath()
        ctx.fill()

        // Draw the price text in black
        ctx.fillStyle = '#000000'
        ctx.textAlign = 'left'
        ctx.fillText(priceText, pillX + pillPadding, currentPriceY + 3)
      }
    }

    // ====================
    // DRAW X-AXIS TIME/DATE LABELS
    // ====================

    ctx.fillStyle = textColor    // Reset to axis label color
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'  // Set font
    ctx.textAlign = 'center'     // Center-align text

    if (data.length > 0) {
      if (hasMultipleDays) {
        // ====================
        // MULTI-DAY INTRADAY: Show time labels for both previous day and today
        // ====================

        const hourLabels: Array<{ x: number; label: string }> = []
        const marketOpenMinutesLabel = 9 * 60 + 30

        // Previous day labels (2PM, 3PM) - positioned in the first section
        const prevDayLabelTimes = [
          { hour: 14, minute: 0, label: '2PM' },
          { hour: 15, minute: 0, label: '3PM' },
        ]

        prevDayLabelTimes.forEach(target => {
          const targetMinutesFromMidnight = target.hour * 60 + target.minute
          const minutesSinceOpen = targetMinutesFromMidnight - marketOpenMinutesLabel
          const targetSlot = Math.floor(minutesSinceOpen / candleIntervalMinutes)
          // Previous day slot position: slot 27 (2pm) maps to position 0, slot 33 (3pm) maps to position 6
          const prevDayPosition = targetSlot - 27
          const x = chartLeft + (prevDayPosition * (chartWidth / totalSlotsWithGap)) + effectiveCandleWidth / 2
          hourLabels.push({ x, label: target.label })
        })

        // Today's labels (10AM, 11AM, 12PM, 1PM, 2PM, 3PM) - positioned after the gap
        const todayLabelTimes = [
          { hour: 10, minute: 0, label: '10AM' },
          { hour: 11, minute: 0, label: '11AM' },
          { hour: 12, minute: 0, label: '12PM' },
          { hour: 13, minute: 0, label: '1PM' },
          { hour: 14, minute: 0, label: '2PM' },
          { hour: 15, minute: 0, label: '3PM' },
        ]

        todayLabelTimes.forEach(target => {
          const targetMinutesFromMidnight = target.hour * 60 + target.minute
          const minutesSinceOpen = targetMinutesFromMidnight - marketOpenMinutesLabel
          const targetSlot = Math.floor(minutesSinceOpen / candleIntervalMinutes)
          // Today's slot position: offset by prevDaySlots + gapSlots
          const adjustedSlot = prevDaySlots + gapSlots + targetSlot
          const x = chartLeft + (adjustedSlot * (chartWidth / totalSlotsWithGap)) + effectiveCandleWidth / 2
          hourLabels.push({ x, label: target.label })
        })

        // Draw all the time labels
        hourLabels.forEach(({ x, label }) => {
          ctx.fillText(label, x, rect.height - 5)
        })

      } else if (!isDailyData) {
        // ====================
        // SINGLE-DAY INTRADAY: Show time labels (10AM, 11AM, 12PM, etc.)
        // ====================

        // Target times for labels
        const labelTimes = [
          { hour: 10, minute: 0, label: '10AM' },
          { hour: 11, minute: 0, label: '11AM' },
          { hour: 12, minute: 0, label: '12PM' },
          { hour: 13, minute: 0, label: '1PM' },
          { hour: 14, minute: 0, label: '2PM' },
          { hour: 15, minute: 0, label: '3PM' },
          { hour: 16, minute: 0, label: '4PM' },
        ]

        const hourLabels: Array<{ x: number; label: string }> = []
        const marketOpenMinutesLabel = 9 * 60 + 30

        // Position labels at exact time positions (not based on closest data)
        labelTimes.forEach(target => {
          const targetMinutesFromMidnight = target.hour * 60 + target.minute
          const minutesSinceOpen = targetMinutesFromMidnight - marketOpenMinutesLabel
          const targetSlot = Math.floor(minutesSinceOpen / candleIntervalMinutes)

          // Calculate x position based on slot within full trading day
          const x = chartLeft + (targetSlot * (chartWidth / totalExpectedCandles)) + candleWidth / 2
          hourLabels.push({ x, label: target.label })
        })

        // Draw all the time labels
        hourLabels.forEach(({ x, label }) => {
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

  }, [data, isDark, previousClose, currentPrice, yAxisInterval, labelIntervalMultiplier, maxCandleWidth, showYAxisLabels])  // Re-run this effect when data, theme, previousClose, currentPrice, maxCandleWidth, or showYAxisLabels changes

  // ====================
  // RENDER
  // ====================

  return (
    <div className="w-full rounded" style={{ height: '250px' }}>
      <canvas
        ref={canvasRef}  // Connect React ref to this canvas element
        className="w-full h-full rounded"
        style={{ touchAction: 'auto', userSelect: 'none' }}
      />
    </div>
  )
}
