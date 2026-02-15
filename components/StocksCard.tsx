'use client'

import Link from 'next/link'

interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume?: number
}

interface StocksCardProps {
  stocks: StockData[]
  title?: string
  type?: 'gainers' | 'losers' | 'default'
  maxItems?: number
}

export default function StocksCard({
  stocks,
  title = 'Stocks',
  type = 'default',
  maxItems = 10,
}: StocksCardProps) {
  if (stocks.length === 0) {
    return null
  }

  const displayStocks = stocks.slice(0, maxItems)

  const formatPrice = (price: number) => {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Determine color based on type or actual change
  const getColorClass = (change: number) => {
    if (type === 'gainers') return 'text-green-500'
    if (type === 'losers') return 'text-red-500'
    return change >= 0 ? 'text-green-500' : 'text-red-500'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-cream-300 dark:border-gray-700 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {displayStocks.map((stock) => {
          const colorClass = getColorClass(stock.change)
          const isPositive = stock.changesPercentage >= 0

          return (
            <Link
              key={stock.symbol}
              href={`/stock/${stock.symbol}`}
              className="flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 -mx-2 px-2 rounded-lg transition-colors"
            >
              {/* Left: Icon circle + name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cream-50 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {stock.symbol.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {stock.symbol}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                    {stock.name}
                  </div>
                </div>
              </div>

              {/* Right: Price + change */}
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(stock.price)}
                </div>
                <div className={`text-xs ${colorClass}`}>
                  {isPositive ? '+' : ''}{stock.changesPercentage.toFixed(1)}%
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
