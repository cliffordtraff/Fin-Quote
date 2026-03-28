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
      <div className="overflow-hidden rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div
          className="grid gap-3 px-4 py-1.5 bg-cream-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap"
          style={tableGridStyle}
        >
          <div>Forex & Bonds</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
        </div>

        <div className="divide-y divide-cream-200 dark:divide-gray-700">
          {data.map((item) => {
            const colorClass = item.change >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'

            return (
              <div
                key={item.symbol}
                className="grid gap-3 items-center px-4 py-2 hover:bg-cream-50 dark:hover:bg-gray-800/50 transition-colors whitespace-nowrap"
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
