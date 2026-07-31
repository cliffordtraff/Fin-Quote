'use client'

import type { CSSProperties } from 'react'
import type { ForexBondData } from '@/app/actions/forex-bonds'

interface ForexBondsTableProps {
  data: ForexBondData[]
}

const tableGridStyle: CSSProperties = {
  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(72px, 0.9fr) minmax(72px, 0.9fr) minmax(82px, 0.95fr)',
}

export default function ForexBondsTable({ data }: ForexBondsTableProps) {
  if (data.length === 0) {
    return null
  }

  const formatPrice = (price: number, symbol: string) => {
    if (symbol.startsWith('^')) {
      return price.toFixed(3).replace(/\.?0+$/, '')
    }
    if (symbol === 'USDJPY') {
      return price.toFixed(2)
    }
    return price.toFixed(4)
  }

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(2)}%`
  }

  const formatChange = (change: number, symbol: string) => {
    const sign = change >= 0 ? '+' : ''
    if (symbol.startsWith('^')) {
      return `${sign}${change.toFixed(3).replace(/\.?0+$/, '')}`
    }
    if (symbol === 'USDJPY') {
      return `${sign}${change.toFixed(2)}`
    }
    return `${sign}${change.toFixed(4)}`
  }

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div
          className="grid min-h-11 items-center gap-3 border-b border-gray-200 px-4 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400 whitespace-nowrap"
          style={tableGridStyle}
        >
          <div className="text-sm font-semibold text-gray-950 dark:text-white">Forex & Rates</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.map((item) => {
            const colorClass = item.change >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'

            return (
              <div
                key={item.symbol}
                className="grid items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70 whitespace-nowrap"
                style={tableGridStyle}
              >
                <div className="min-w-0 truncate text-xs font-medium text-sage-600 dark:text-sage-400">
                  {item.name}
                </div>
                <div className={`text-right text-xs tabular-nums ${colorClass}`}>
                  {formatPrice(item.price, item.symbol)}
                </div>
                <div className={`text-right text-xs tabular-nums ${colorClass}`}>
                  {formatChange(item.change, item.symbol)}
                </div>
                <div className={`text-right text-xs tabular-nums ${colorClass}`}>
                  {formatPercentage(item.changesPercentage)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
