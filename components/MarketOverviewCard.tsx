'use client'

interface MarketItem {
  symbol: string
  name: string
  subtitle?: string
  price: number
  change: number
  changesPercentage: number
}

interface MarketOverviewCardProps {
  title: string
  totalValue?: number
  totalChange?: number
  totalChangePercent?: number
  items: MarketItem[]
  formatPrice?: (price: number, symbol: string) => string
  formatChange?: (change: number, symbol: string) => string
  showTotalHeader?: boolean
}

export default function MarketOverviewCard({
  title,
  totalValue,
  totalChange,
  totalChangePercent,
  items,
  formatPrice = (price) => `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  formatChange = (change) => `$${Math.abs(change).toFixed(2)}`,
  showTotalHeader = true,
}: MarketOverviewCardProps) {
  const totalIsPositive = (totalChangePercent ?? 0) >= 0

  return (
    <div className="bg-white dark:bg-[rgb(40,40,40)] rounded-2xl p-5 shadow-sm">
      {/* Header with title and optional total */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</div>
        {showTotalHeader && totalValue !== undefined && (
          <>
            <div className="text-3xl font-semibold text-gray-900 dark:text-white">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {totalChange !== undefined && totalChangePercent !== undefined && (
              <div className={`text-sm flex items-center gap-1 ${totalIsPositive ? 'text-green-500' : 'text-red-500'}`}>
                <span>{totalIsPositive ? '↗' : '↘'}</span>
                <span>{formatChange(totalChange, '')}</span>
                <span>({totalIsPositive ? '+' : ''}{totalChangePercent.toFixed(1)}%)</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {items.map((item) => {
          const isPositive = item.changesPercentage >= 0
          const firstLetter = item.name.charAt(0).toUpperCase()

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
                    {item.subtitle || 'Index'}
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
