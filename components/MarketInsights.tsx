'use client'

import { useEffect, useRef } from 'react'
import type { SP500GainerSparklineData } from '@/app/actions/sp500-gainer-sparklines'

interface MarketInsightsProps {
  metaSparkline?: SP500GainerSparklineData
  xlbSparkline?: SP500GainerSparklineData
}

function MiniSparkline({ data }: { data: SP500GainerSparklineData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.priceHistory.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = 100
    const height = 30

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    const prices = data.priceHistory.map(d => d.close)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice || 1

    const padding = 2

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)' // green color
    ctx.lineWidth = 1.5

    prices.forEach((price, i) => {
      const x = padding + (i / (prices.length - 1)) * (width - padding * 2)
      const y = padding + (1 - (price - minPrice) / priceRange) * (height - padding * 2)

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.stroke()
  }, [data])

  return <canvas ref={canvasRef} />
}

export default function MarketInsights({ metaSparkline, xlbSparkline }: MarketInsightsProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden self-start" style={{ width: '340px' }}>
      <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Market Trends</h2>
      </div>
      <div className="p-2 text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-green-500">📈</span>
          <span>Materials is the leading sector on the day.</span>
          {xlbSparkline && xlbSparkline.priceHistory.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <MiniSparkline data={xlbSparkline} />
              <span className="text-xs text-green-500">+{xlbSparkline.changesPercentage.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-500">🏆</span>
          <span>META is the biggest gainer in the S&P 500.</span>
          {metaSparkline && metaSparkline.priceHistory.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <MiniSparkline data={metaSparkline} />
              <span className="text-xs text-green-500">+{metaSparkline.changesPercentage.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p className="flex items-center gap-2">
          <span className="text-orange-500">⚡</span>
          Technology stocks are mixed in early trading.
        </p>
      </div>
    </div>
  )
}
