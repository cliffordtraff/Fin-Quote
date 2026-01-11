'use client'

interface GainerData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
  floatShares?: number | null
}

interface GainersTableProps {
  gainers: GainerData[]
}

export default function GainersTable({ gainers }: GainersTableProps) {
  const formatPrice = (price: number) => {
    if (!price && price !== 0) return 'N/A'
    return `$${price.toFixed(2)}`
  }

  const formatChange = (change: number) => {
    if (!change && change !== 0) return 'N/A'
    const sign = change >= 0 ? '+' : ''
    return `${sign}$${change.toFixed(2)}`
  }

  const formatPercentage = (percentage: number) => {
    if (!percentage && percentage !== 0) return 'N/A'
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(2)}%`
  }

  const formatVolume = (volume: number) => {
    if (!volume || volume === 0) {
      return '—'
    }
    if (volume >= 1_000_000_000) {
      return `${(volume / 1_000_000_000).toFixed(1)}B`
    }
    if (volume >= 1_000_000) {
      return `${(volume / 1_000_000).toFixed(1)}M`
    }
    if (volume >= 1_000) {
      return `${(volume / 1_000).toFixed(1)}K`
    }
    return volume.toLocaleString()
  }

  const formatFloat = (floatShares: number | null | undefined) => {
    if (!floatShares || floatShares === 0) {
      return '—'
    }
    if (floatShares >= 1_000_000_000) {
      return `${(floatShares / 1_000_000_000).toFixed(1)}B`
    }
    if (floatShares >= 1_000_000) {
      return `${(floatShares / 1_000_000).toFixed(1)}M`
    }
    if (floatShares >= 1_000) {
      return `${(floatShares / 1_000).toFixed(0)}K`
    }
    return floatShares.toLocaleString()
  }

  if (gainers.length === 0) {
    return (
      <div className="w-full max-w-3xl">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center text-gray-500 dark:text-gray-400">
            Loading gainers data...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-6 gap-3 px-4 py-1 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold">
          <div>Symbol</div>
          <div className="text-right">Last</div>
          <div className="text-right">Change</div>
          <div className="text-right">Change %</div>
          <div className="text-right">Volume</div>
          <div className="text-right">Float</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
          {gainers.map((gainer) => {
            const isPositive = gainer.change >= 0
            const colorClass = isPositive
              ? 'text-green-500'
              : 'text-red-500'

            return (
              <div
                key={gainer.symbol}
                className="grid grid-cols-6 gap-3 px-4 py-1 hover:bg-gray-750 transition-colors"
              >
                <div className="text-blue-400 font-medium text-xs">{gainer.symbol}</div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatPrice(gainer.price)}
                </div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {formatChange(gainer.change)}
                </div>
                <div className={`text-right ${colorClass} font-semibold text-xs`}>
                  {formatPercentage(gainer.changesPercentage)}
                </div>
                <div className="text-right text-gray-600 dark:text-gray-400 text-xs">
                  {formatVolume(gainer.volume)}
                </div>
                <div className="text-right text-gray-600 dark:text-gray-400 text-xs">
                  {formatFloat(gainer.floatShares)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
