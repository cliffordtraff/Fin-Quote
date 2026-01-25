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
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-4">
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
    <div className="w-full max-w-sm">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-3 gap-3 px-4 py-1 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold">
          <div>Sector</div>
          <div className="text-right">Change %</div>
          <div className="text-right">YTD</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {sortedSectors.map((sector) => {
            const percentage = parsePercentage(sector.changesPercentage)
            const isPositive = percentage >= 0
            const colorClass = isPositive ? 'text-green-500' : 'text-red-500'

            const ytdIsPositive = (sector.ytdReturn ?? 0) >= 0
            const ytdColorClass = ytdIsPositive ? 'text-green-500' : 'text-red-500'

            return (
              <div
                key={sector.sector}
                className="grid grid-cols-3 gap-3 px-4 py-1.5 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="text-blue-400 font-medium text-xs truncate">
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
