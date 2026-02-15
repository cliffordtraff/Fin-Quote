'use client'

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  ytdPriceHistory?: Array<{ date: string; close: number }>
  ytdChangePercent?: number
}

interface FuturesCardProps {
  futures: FutureData[]
}

// Map futures symbols to display names
const FUTURES_DISPLAY_NAMES: Record<string, string> = {
  'ES': 'S&P 500 Futures',
  'NQ': 'NASDAQ Futures',
  'YM': 'Dow Futures',
  'RTY': 'Russell 2000 Futures',
  'ZB': '30-Year Bond',
  'ZN': '10-Year Note',
  'ZF': '5-Year Note',
  'CL': 'Crude Oil',
  'GC': 'Gold',
  'SI': 'Silver',
  'NG': 'Natural Gas',
}

export default function FuturesCard({ futures }: FuturesCardProps) {
  if (futures.length === 0) {
    return null
  }

  const formatPrice = (price: number) => {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="bg-white dark:bg-[rgb(40,40,40)] rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Futures</div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {futures.map((future) => {
          const isPositive = future.changesPercentage >= 0
          const firstLetter = future.name.charAt(0).toUpperCase()
          const displayName = FUTURES_DISPLAY_NAMES[future.symbol] || future.name

          return (
            <div
              key={future.symbol}
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
                    {displayName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {future.symbol}
                  </div>
                </div>
              </div>

              {/* Right: Price + change */}
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(future.price)}
                </div>
                <div className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{future.changesPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
