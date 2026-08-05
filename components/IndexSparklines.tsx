'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import type { OHLCData, SparklineIndexData } from '@/app/actions/sparkline-indices'

interface IndexSparklinesProps {
  indices: SparklineIndexData[]
}

function drawCandles(
  ctx: CanvasRenderingContext2D,
  candles: OHLCData[],
  startIndex: number,
  totalCandles: number,
  width: number,
  height: number,
  minPrice: number,
  priceRange: number,
  dimmed: boolean,
  dark: boolean,
) {
  const step = width / Math.max(totalCandles, 1)
  const bodyWidth = Math.max(1.5, Math.min(4, step * 0.62))

  candles.forEach((candle, index) => {
    const x = (startIndex + index + 0.5) * step
    const scaleY = (value: number) => ((minPrice + priceRange - value) / priceRange) * height
    const openY = scaleY(candle.open)
    const closeY = scaleY(candle.close)
    const color = candle.close >= candle.open
      ? dimmed
        ? dark ? '#166534' : '#65a30d'
        : dark ? '#4ade80' : '#16a34a'
      : dimmed
        ? dark ? '#991b1b' : '#f87171'
        : dark ? '#f87171' : '#dc2626'

    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, scaleY(candle.high))
    ctx.lineTo(x, scaleY(candle.low))
    ctx.stroke()
    ctx.fillRect(
      x - bodyWidth / 2,
      Math.min(openY, closeY),
      bodyWidth,
      Math.max(1, Math.abs(closeY - openY)),
    )
  })
}

function SparklineCard({ index, last }: { index: SparklineIndexData; last: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const positive = index.priceChangePercent >= 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => {
      const context = canvas.getContext('2d')
      if (!context) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)

      const yesterday = index.yesterdayOHLC ?? []
      const today = index.todayOHLC ?? []
      const all = [...yesterday, ...today]
      if (all.length === 0) return
      const values = all.flatMap((candle) => [candle.high, candle.low])
      if (index.previousClose) values.push(index.previousClose)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const padding = Math.max((max - min) * 0.06, 0.01)
      const minPrice = min - padding
      const priceRange = max - min + padding * 2

      context.strokeStyle = isDark ? 'rgba(148,163,184,.18)' : 'rgba(100,116,139,.15)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, rect.height / 2)
      context.lineTo(rect.width, rect.height / 2)
      context.stroke()

      const total = all.length
      drawCandles(
        context,
        yesterday,
        0,
        total,
        rect.width,
        rect.height,
        minPrice,
        priceRange,
        true,
        isDark,
      )
      drawCandles(
        context,
        today,
        yesterday.length,
        total,
        rect.width,
        rect.height,
        minPrice,
        priceRange,
        false,
        isDark,
      )

      if (yesterday.length > 0 && today.length > 0) {
        const dividerX = (yesterday.length / total) * rect.width
        context.setLineDash([3, 3])
        context.strokeStyle = isDark ? 'rgba(148,163,184,.35)' : 'rgba(100,116,139,.3)'
        context.beginPath()
        context.moveTo(dividerX, 0)
        context.lineTo(dividerX, rect.height)
        context.stroke()
        context.setLineDash([])
      }
    }

    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [index.previousClose, index.todayOHLC, index.yesterdayOHLC, isDark])

  return (
    <Link
      href={`/workspace/chart?symbol=${encodeURIComponent(index.symbol)}`}
      aria-label={`Open ${index.name} chart`}
      className={`min-w-0 border-b border-r border-gray-200 px-3 py-3 no-underline transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60 md:border-b-0 ${last ? 'md:border-r-0' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
            {index.name}
          </p>
          <p className="mt-0.5 truncate text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {index.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${
          positive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
        }`}>
          {positive ? '+' : ''}{index.priceChangePercent.toFixed(2)}%
        </span>
      </div>
      <canvas ref={canvasRef} aria-hidden="true" className="mt-2 h-[68px] w-full" />
    </Link>
  )
}

export default function IndexSparklines({ indices }: IndexSparklinesProps) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:grid-cols-5">
      {indices.map((index, itemIndex) => (
        <SparklineCard
          key={index.symbol}
          index={index}
          last={itemIndex === indices.length - 1}
        />
      ))}
    </div>
  )
}
