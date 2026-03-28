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

interface FuturesTableProps {
  futures: FutureData[]
}

export default function FuturesTable({ futures }: FuturesTableProps) {
  const hasSparklineData = futures.some(f => f.ytdPriceHistory && f.ytdPriceHistory.length > 0)

  const formatPrice = (price: number) => {
    return price.toFixed(2)
  }

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}`
  }

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(2)}%`
  }

  return (
    <div className="w-full max-w-lg h-full">
      <div className="h-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-cream-300 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800">
          <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Futures</h2>
        </div>

        <div className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} gap-3 px-4 py-2 bg-cream-50 dark:bg-gray-800/60 border-b border-cream-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-white whitespace-nowrap`}>
          <div>Futures</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
          {hasSparklineData && <div className="text-right">YTD</div>}
        </div>

        {/* Rows */}
        <div className="divide-y divide-cream-200 dark:divide-gray-700">
          {futures.map((future) => {
            const isPositive = future.change >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            const ytdIsPositive = (future.ytdChangePercent ?? 0) >= 0

            return (
              <div
                key={future.symbol}
                className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} gap-3 px-4 py-1.5 items-center hover:bg-cream-50 dark:hover:bg-gray-800/50 transition-colors`}
              >
                <div className="text-sage-600 dark:text-sage-400 font-medium text-xs">{future.name}</div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatPrice(future.price)}
                </div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatChange(future.change)}
                </div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatPercentage(future.changesPercentage)}
                </div>
                {hasSparklineData && (
                  <div className={`text-right text-xs ${ytdIsPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {future.ytdChangePercent !== undefined ? (
                      <>{ytdIsPositive ? '+' : ''}{future.ytdChangePercent.toFixed(2)}%</>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
