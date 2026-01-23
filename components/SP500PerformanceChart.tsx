'use client'

import type { SP500MoverData } from '@/app/actions/sp500-movers'

interface SP500PerformanceChartProps {
  gainers: SP500MoverData[]
  losers: SP500MoverData[]
}

export default function SP500PerformanceChart({ gainers, losers }: SP500PerformanceChartProps) {
  // Combine and sort: gainers at top (highest first), losers at bottom (most negative last)
  const sortedGainers = [...gainers].sort((a, b) => b.changesPercentage - a.changesPercentage)
  const sortedLosers = [...losers].sort((a, b) => b.changesPercentage - a.changesPercentage)

  // Find max absolute percentage for scaling
  const maxGain = sortedGainers.length > 0 ? sortedGainers[0].changesPercentage : 0
  const maxLoss = sortedLosers.length > 0 ? Math.abs(sortedLosers[sortedLosers.length - 1].changesPercentage) : 0
  const maxPercent = Math.max(maxGain, maxLoss, 1)

  const renderBar = (stock: SP500MoverData, isGainer: boolean) => {
    const percent = Math.abs(stock.changesPercentage)
    const widthPercent = (percent / maxPercent) * 100

    return (
      <div key={stock.symbol} className="flex items-center h-[11px]">
        {/* Bar */}
        <div
          className={`h-[7px] rounded-sm ${isGainer ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${Math.max(widthPercent, 2)}%` }}
        />
        {/* Label */}
        <div className="flex items-center ml-1 text-[9px] leading-none whitespace-nowrap">
          <span className={`font-medium ${isGainer ? 'text-green-500' : 'text-red-500'}`}>
            {isGainer ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
          </span>
          <span className="ml-1 text-gray-400 dark:text-gray-500 font-medium">
            {stock.symbol}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '400px' }}>
      <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">S&P 500 Biggest Movers</h2>
      </div>
      <div className="px-2 py-1">
        <div className="space-y-[2px]">
          {/* Gainers */}
          {sortedGainers.map(stock => renderBar(stock, true))}

          {/* Divider between gainers and losers */}
          {sortedGainers.length > 0 && sortedLosers.length > 0 && (
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
          )}

          {/* Losers */}
          {sortedLosers.map(stock => renderBar(stock, false))}
        </div>
      </div>
    </div>
  )
}
