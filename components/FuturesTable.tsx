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
  compact?: boolean
}

export default function FuturesTable({ futures, compact = false }: FuturesTableProps) {
  const displayedFutures = compact
    ? (() => {
        const notable = futures.filter((future) => Math.abs(future.changesPercentage) >= 1)
        return (notable.length > 0
          ? notable
          : [...futures].sort(
              (left, right) => Math.abs(right.changesPercentage) - Math.abs(left.changesPercentage),
            )
        ).slice(0, 4)
      })()
    : futures
  const hasSparklineData = displayedFutures.some(f => f.ytdPriceHistory && f.ytdPriceHistory.length > 0)

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
    <div className="h-full w-full">
      <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex min-h-11 items-center border-b border-gray-200 px-4 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Futures</h2>
          {compact ? (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">Notable</span>
          ) : null}
        </div>

        <div className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 whitespace-nowrap`}>
          <div>Futures</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
          {hasSparklineData && <div className="text-right">YTD</div>}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {displayedFutures.map((future) => {
            const isPositive = future.change >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            const ytdIsPositive = (future.ytdChangePercent ?? 0) >= 0

            return (
              <div
                key={future.symbol}
                className={`grid ${hasSparklineData ? 'grid-cols-5' : 'grid-cols-4'} items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70`}
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
