'use client'

interface IndexData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  previousClose?: number
}

interface IndexCardProps {
  indices: IndexData[]
}

// Map index symbols to display info
const INDEX_INFO: Record<string, { name: string; abbrev: string }> = {
  '^GSPC': { name: 'S&P 500', abbrev: 'S' },
  '^SPX': { name: 'S&P 500', abbrev: 'S' },
  'SPY': { name: 'S&P 500', abbrev: 'S' },
  '^IXIC': { name: 'NASDAQ', abbrev: 'N' },
  '^NDX': { name: 'NASDAQ 100', abbrev: 'N' },
  'QQQ': { name: 'NASDAQ', abbrev: 'N' },
  '^DJI': { name: 'DOW', abbrev: 'D' },
  'DIA': { name: 'DOW', abbrev: 'D' },
  '^RUT': { name: 'Russell 2000', abbrev: 'R' },
  'IWM': { name: 'Russell 2000', abbrev: 'R' },
}

export default function IndexCard({ indices }: IndexCardProps) {
  // Filter out any indices with invalid data
  const validIndices = indices.filter(idx =>
    idx.price !== undefined && idx.price !== null && !isNaN(idx.price)
  )

  if (validIndices.length === 0) {
    return null
  }

  // Calculate total market value (sum of all indices) and weighted change
  const totalValue = validIndices.reduce((sum, idx) => sum + (idx.price || 0), 0)
  const totalChange = validIndices.reduce((sum, idx) => sum + (idx.change || 0), 0)

  // Calculate weighted average percentage change
  const weightedChangePercent = totalValue > 0 ? validIndices.reduce((sum, idx) => {
    const weight = (idx.price || 0) / totalValue
    return sum + ((idx.changesPercentage || 0) * weight)
  }, 0) : 0

  const totalIsPositive = weightedChangePercent >= 0

  const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '$—'
    }
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="bg-white dark:bg-[rgb(40,40,40)] rounded-2xl p-5 shadow-sm">
      {/* Header with total */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Market Overview</div>
        <div className="text-3xl font-semibold text-gray-900 dark:text-white">
          {formatPrice(totalValue)}
        </div>
        <div className={`text-sm flex items-center gap-1 ${totalIsPositive ? 'text-green-500' : 'text-red-500'}`}>
          <span>{totalIsPositive ? '↗' : '↘'}</span>
          <span>${Math.abs(totalChange).toFixed(2)}</span>
          <span>({totalIsPositive ? '+' : ''}{weightedChangePercent.toFixed(1)}%)</span>
        </div>
      </div>

      {/* Index items */}
      <div className="space-y-3">
        {validIndices.map((idx) => {
          const isPositive = (idx.changesPercentage || 0) >= 0
          const info = INDEX_INFO[idx.symbol] || { name: idx.name, abbrev: idx.name.charAt(0) }

          return (
            <div
              key={idx.symbol}
              className="flex items-center justify-between py-2"
            >
              {/* Left: Icon circle + name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {info.abbrev}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {info.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Index
                  </div>
                </div>
              </div>

              {/* Right: Price + change */}
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(idx.price)}
                </div>
                <div className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{idx.changesPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
