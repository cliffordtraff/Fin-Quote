'use client'

import { useRef, useEffect } from 'react'
import type { FinancialChartData } from '@/app/actions/get-financial-chart-data'

interface FinancialMetricsChartsProps {
  data: FinancialChartData[]
}

interface SingleChartProps {
  title: string
  data: { year: number; value: number | null }[]
  formatValue: (value: number) => string
  formatLabel: (value: number) => string
  unit?: string
}

function SingleBarChart({ title, data, formatValue, formatLabel, unit }: SingleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Filter out null values and get valid data
    const validData = data.filter(d => d.value !== null) as { year: number; value: number }[]

    if (validData.length === 0) {
      ctx.fillStyle = 'rgba(156, 163, 175, 0.5)'
      ctx.font = '12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('No data available', width / 2, height / 2)
      return
    }

    // Chart dimensions
    const padding = { top: 25, right: 35, bottom: 25, left: 10 }
    const barsRightGap = 8 // Gap between last bar and Y-axis
    const chartWidth = width - padding.left - padding.right - barsRightGap
    const chartHeight = height - padding.top - padding.bottom

    // Calculate bar dimensions
    const barCount = validData.length
    const barGap = 6
    const barWidth = (chartWidth - (barCount - 1) * barGap) / barCount

    // Find min and max values for scaling
    const values = validData.map(d => d.value)
    const maxValue = Math.max(...values)
    const minValue = Math.min(0, ...values)
    const valueRange = maxValue - minValue || 1

    // Calculate scale for Y axis
    const yScale = chartHeight / valueRange

    // Calculate nice tick interval to get ~5 ticks
    const rawInterval = valueRange / 5
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const normalized = rawInterval / magnitude
    let niceInterval: number
    if (normalized <= 1.5) niceInterval = magnitude
    else if (normalized <= 3) niceInterval = 2 * magnitude
    else if (normalized <= 7) niceInterval = 5 * magnitude
    else niceInterval = 10 * magnitude

    // Start from 0 or nearest nice number below min
    const startTick = Math.floor(minValue / niceInterval) * niceInterval

    // Draw Y axis line on the right side
    const yAxisX = width - padding.right
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(yAxisX, padding.top)
    ctx.lineTo(yAxisX, height - padding.bottom)
    ctx.stroke()

    // Draw Y axis labels and tick marks
    ctx.fillStyle = 'rgba(156, 163, 175, 0.7)'
    ctx.font = '9px system-ui'
    ctx.textAlign = 'left'

    for (let tickValue = startTick; tickValue <= maxValue + niceInterval * 0.1; tickValue += niceInterval) {
      if (tickValue < minValue - niceInterval * 0.1) continue
      const tickY = padding.top + chartHeight - ((tickValue - minValue) * yScale)
      if (tickY >= padding.top - 5 && tickY <= height - padding.bottom + 5) {
        // Draw tick mark
        ctx.beginPath()
        ctx.moveTo(yAxisX, tickY)
        ctx.lineTo(yAxisX + 4, tickY)
        ctx.stroke()
        // Draw label
        ctx.fillText(formatLabel(tickValue), yAxisX + 6, tickY + 3)
      }
    }

    // Draw X axis line (bottom border)
    ctx.beginPath()
    ctx.moveTo(padding.left, height - padding.bottom)
    ctx.lineTo(yAxisX, height - padding.bottom)
    ctx.stroke()

    // Draw bars
    validData.forEach((item, index) => {
      const x = padding.left + index * (barWidth + barGap)
      const barHeight = (item.value - minValue) * yScale
      const y = padding.top + chartHeight - barHeight

      // Bar color (cornflower blue)
      ctx.fillStyle = 'rgb(100, 149, 237)'

      // Draw bar
      ctx.fillRect(x, y, barWidth, barHeight)

      // Draw value label on top of bar
      ctx.fillStyle = 'rgb(100, 149, 237)'
      ctx.font = 'bold 10px system-ui'
      ctx.textAlign = 'center'
      const valueText = formatValue(item.value)
      ctx.fillText(valueText, x + barWidth / 2, y - 5)

      // Draw year label below bar
      ctx.fillStyle = 'rgba(156, 163, 175, 0.8)'
      ctx.font = '11px system-ui'
      ctx.fillText(item.year.toString(), x + barWidth / 2, height - padding.bottom + 13)
    })

  }, [data, formatValue, formatLabel])

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-medium text-gray-400 mb-2">
        {title}{unit && ` (${unit})`}
      </h3>
      <div className="bg-[rgb(30,30,30)] rounded-lg p-3" style={{ height: '160px' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

export default function FinancialMetricsCharts({ data }: FinancialMetricsChartsProps) {
  if (!data || data.length === 0) {
    return null
  }

  // Format EPS data
  const epsData = data.map(d => ({
    year: d.year,
    value: d.eps,
  }))

  // Format Revenue data (convert to billions)
  const revenueData = data.map(d => ({
    year: d.year,
    value: d.revenue ? d.revenue / 1e9 : null,
  }))

  // Format Shares Outstanding data (convert to billions)
  const sharesData = data.map(d => ({
    year: d.year,
    value: d.sharesOutstanding ? d.sharesOutstanding / 1e9 : null,
  }))

  // Format functions
  const formatEps = (value: number) => value.toFixed(2)
  const formatBillions = (value: number) => value >= 100 ? value.toFixed(0) : value.toFixed(1)
  const formatEpsLabel = (value: number) => value.toFixed(1)
  const formatBillionsLabel = (value: number) => value.toFixed(0)

  return (
    <div className="flex gap-4">
      <SingleBarChart
        title="EPS"
        data={epsData}
        formatValue={formatEps}
        formatLabel={formatEpsLabel}
      />
      <SingleBarChart
        title="Sales"
        data={revenueData}
        formatValue={formatBillions}
        formatLabel={formatBillionsLabel}
        unit="$bln"
      />
      <SingleBarChart
        title="Shares Outstanding"
        data={sharesData}
        formatValue={formatBillions}
        formatLabel={formatBillionsLabel}
        unit="bln"
      />
    </div>
  )
}
