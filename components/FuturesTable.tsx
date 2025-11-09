'use client'

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

interface FuturesTableProps {
  futures: FutureData[]
}

export default function FuturesTable({ futures }: FuturesTableProps) {
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
    <div className="w-full max-w-sm">
      <div className="bg-gray-800 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-4 gap-3 px-4 py-1 bg-gray-700 dark:bg-gray-800 text-gray-300 text-xs font-semibold">
          <div>Futures</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-700">
          {futures.map((future) => {
            const isPositive = future.change >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            return (
              <div
                key={future.symbol}
                className="grid grid-cols-4 gap-3 px-4 py-1 hover:bg-gray-750 transition-colors"
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
