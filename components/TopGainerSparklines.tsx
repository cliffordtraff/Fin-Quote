'use client'

import { useEffect, useRef, useState } from 'react'
import type { SP500GainerSparklineData } from '@/app/actions/sp500-gainer-sparklines'
import type { SP500LoserSparklineData } from '@/app/actions/sp500-loser-sparklines'

interface TopGainerSparklinesProps {
  sparklines: SP500GainerSparklineData[]
  loserSparklines?: SP500LoserSparklineData[]
}

type SparklineData = SP500GainerSparklineData | SP500LoserSparklineData

function MiniSparkline({ data, isLoser }: { data: SparklineData; isLoser: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.priceHistory.length === 0) return

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const width = Math.max(120, Math.round(canvas.clientWidth))
      const height = 60

      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const prices = data.priceHistory.map(point => point.close)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const priceRange = maxPrice - minPrice || 1
      const padding = 4

      ctx.beginPath()
      ctx.strokeStyle = 'rgba(180, 180, 180, 0.8)'
      ctx.lineWidth = 1.5

      prices.forEach((price, index) => {
        const denominator = Math.max(1, prices.length - 1)
        const x = padding + (index / denominator) * (width - padding * 2)
        const y = padding + (1 - (price - minPrice) / priceRange) * (height - padding * 2)

        if (index === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })

      ctx.stroke()
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [data])

  if (data.priceHistory.length === 0) {
    return (
      <div className="flex min-w-0 flex-col items-center">
        <span className="text-sm font-medium text-gray-400 mb-2">{data.symbol}</span>
        <div className="flex h-[60px] w-full items-center justify-center text-xs text-gray-500">
          No data
        </div>
      </div>
    )
  }

  const changeColor = isLoser ? 'text-red-500' : 'text-green-500'
  const changePrefix = isLoser ? '' : '+'

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-400">{data.symbol}</span>
        <span className={`text-sm font-medium ${changeColor}`}>
          {changePrefix}{data.changesPercentage.toFixed(2)}%
        </span>
      </div>
      <canvas ref={canvasRef} className="h-[60px] w-full" />
    </div>
  )
}

export default function TopGainerSparklines({ sparklines, loserSparklines = [] }: TopGainerSparklinesProps) {
  const [showLosers, setShowLosers] = useState(false)

  // Auto-switch between gainers and losers every 5 seconds
  useEffect(() => {
    if (loserSparklines.length === 0) return

    const interval = setInterval(() => {
      setShowLosers(prev => !prev)
    }, 5000)

    return () => clearInterval(interval)
  }, [loserSparklines.length])

  if (sparklines.length === 0 && loserSparklines.length === 0) {
    return null
  }

  const currentSparklines = showLosers ? loserSparklines : sparklines
  const hasToggle = sparklines.length > 0 && loserSparklines.length > 0

  return (
    <div className="relative">
      {/* Toggle indicator */}
      {hasToggle && (
        <div className="flex justify-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setShowLosers(false)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              !showLosers
                ? 'bg-green-500/20 text-green-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Top Gainers
          </button>
          <button
            type="button"
            onClick={() => setShowLosers(true)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              showLosers
                ? 'bg-red-500/20 text-red-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Top Losers
          </button>
        </div>
      )}

      {/* Sparklines */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 py-4 sm:grid-cols-4">
        {currentSparklines.map((sparkline) => (
          <MiniSparkline key={sparkline.symbol} data={sparkline} isLoser={showLosers} />
        ))}
      </div>
    </div>
  )
}
