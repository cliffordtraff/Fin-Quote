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
    <div className="w-full max-w-lg">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} gap-3 px-4 py-1 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold`}>
          <div>Futures</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
          {hasSparklineData && <div className="text-right">YTD</div>}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {futures.map((future) => {
            const isPositive = future.change >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            const ytdIsPositive = (future.ytdChangePercent ?? 0) >= 0

            return (
              <div
                key={future.symbol}
                className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} gap-3 px-4 py-1.5 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
              >
                <div className="text-blue-400 font-medium text-xs">{future.name}</div>
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
