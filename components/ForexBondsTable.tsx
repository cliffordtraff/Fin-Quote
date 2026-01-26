'use client'

import type { ForexBondData } from '@/app/actions/forex-bonds'

interface ForexBondsTableProps {
  data: ForexBondData[]
}

export default function ForexBondsTable({ data }: ForexBondsTableProps) {
  if (data.length === 0) {
    return null
  }

  const formatPrice = (price: number, symbol: string) => {
    // Treasury yields are already in percentage form
    if (symbol.startsWith('^')) {
      return price.toFixed(3)
    }
    // BTC needs more decimal places shown differently
    if (symbol === 'BTCUSD') {
      return price.toFixed(2)
    }
    // Forex pairs typically show 4 decimal places
    return price.toFixed(4)
  }

  const formatChange = (change: number, symbol: string) => {
    const sign = change >= 0 ? '+' : ''
    if (symbol.startsWith('^')) {
      return `${sign}${change.toFixed(3)}`
    }
    if (symbol === 'BTCUSD') {
      return `${sign}${change.toFixed(2)}`
    }
    return `${sign}${change.toFixed(4)}`
  }

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(2)}%`
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-4 gap-3 px-4 py-1 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold whitespace-nowrap">
          <div>Forex & Bonds</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-700">
          {data.map((item) => {
            const isPositive = item.changesPercentage >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            return (
              <div
                key={item.symbol}
                className="grid grid-cols-4 gap-3 px-4 py-1 hover:bg-gray-750 transition-colors whitespace-nowrap"
              >
                <div className="text-blue-400 font-medium text-xs">{item.name}</div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatPrice(item.price, item.symbol)}
                </div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatChange(item.change, item.symbol)}
                </div>
                <div className={`text-right ${colorClass} text-xs`}>
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
