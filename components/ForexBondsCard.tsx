'use client'

import type { ForexBondDataWithYTD } from '@/app/actions/forex-bonds'

interface ForexBondsCardProps {
  data: ForexBondDataWithYTD[]
  title?: string
}

// Map symbols to display categories
const SYMBOL_CATEGORIES: Record<string, string> = {
  'EURUSD': 'Forex',
  'GBPUSD': 'Forex',
  'USDJPY': 'Forex',
  'USDCAD': 'Forex',
  'AUDUSD': 'Forex',
  'USDCHF': 'Forex',
  '^TNX': 'Treasury',
  '^TYX': 'Treasury',
  '^FVX': 'Treasury',
  '^IRX': 'Treasury',
  'BTCUSD': 'Crypto',
  'ETHUSD': 'Crypto',
  'DXY': 'Index',
}

export default function ForexBondsCard({ data, title = 'Forex & Bonds' }: ForexBondsCardProps) {
  if (data.length === 0) {
    return null
  }

  const formatPrice = (price: number, symbol: string) => {
    // Treasury yields are already in percentage form
    if (symbol.startsWith('^')) {
      return `${price.toFixed(3)}%`
    }
    // BTC/ETH
    if (symbol === 'BTCUSD' || symbol === 'ETHUSD') {
      return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    // Forex pairs typically show 4 decimal places
    return price.toFixed(4)
  }

  return (
    <div className="bg-white dark:bg-[rgb(40,40,40)] rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {data.map((item) => {
          const isPositive = item.changesPercentage >= 0
          const firstLetter = item.name.charAt(0).toUpperCase()
          const category = SYMBOL_CATEGORIES[item.symbol] || 'Other'

          return (
            <div
              key={item.symbol}
              className="flex items-center justify-between py-2"
            >
              {/* Left: Icon circle + name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {firstLetter}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {category}
                  </div>
                </div>
              </div>

              {/* Right: Price + change */}
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(item.price, item.symbol)}
                </div>
                <div className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{item.changesPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
