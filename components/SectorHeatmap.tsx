'use client'

interface SectorData {
  sector: string
  changesPercentage: string
  ytdReturn?: number
}

interface SectorHeatmapProps {
  sectors: SectorData[]
}

export default function SectorHeatmap({ sectors }: SectorHeatmapProps) {
  const parsePercentage = (percentStr: string): number => {
    return parseFloat(percentStr.replace('%', ''))
  }

  if (sectors.length === 0) {
    return (
      <div className="w-full">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            Loading sector performance...
          </div>
        </div>
      </div>
    )
  }

  // Sort sectors by percentage change (descending)
  const sortedSectors = [...sectors].sort((a, b) => {
    return parsePercentage(b.changesPercentage) - parsePercentage(a.changesPercentage)
  })

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : ''
    return `${sign}${percentage.toFixed(2)}%`
  }

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="grid min-h-11 grid-cols-3 items-center gap-3 border-b border-gray-200 px-4 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <div className="text-sm font-semibold text-gray-950 dark:text-white">Sectors</div>
          <div className="text-right">Change %</div>
          <div className="text-right">YTD</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sortedSectors.map((sector) => {
            const percentage = parsePercentage(sector.changesPercentage)
            const isPositive = percentage >= 0
            const colorClass = isPositive ? 'text-green-500' : 'text-red-500'

            const ytdIsPositive = (sector.ytdReturn ?? 0) >= 0
            const ytdColorClass = ytdIsPositive ? 'text-green-500' : 'text-red-500'

            return (
              <div
                key={sector.sector}
                className="grid grid-cols-3 items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70"
              >
                <div className="text-sage-600 dark:text-sage-400 font-medium text-xs truncate">
                  {sector.sector}
                </div>
                <div className={`text-right text-xs ${colorClass}`}>
                  {formatPercentage(percentage)}
                </div>
                <div className={`text-right text-xs ${ytdColorClass}`}>
                  {sector.ytdReturn !== undefined ? (
                    formatPercentage(sector.ytdReturn)
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
