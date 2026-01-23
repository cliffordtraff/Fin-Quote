'use client'

interface SectorData {
  sector: string
  changesPercentage: string
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

  // Sort sectors by performance: highest to lowest (top to bottom)
  const sortedSectors = [...sectors].sort((a, b) => {
    const aPercent = parsePercentage(a.changesPercentage)
    const bPercent = parsePercentage(b.changesPercentage)
    return bPercent - aPercent
  })

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="grid grid-cols-2 gap-3 px-4 py-1 bg-gray-100 dark:bg-[rgb(26,26,26)] text-gray-700 dark:text-gray-300 text-xs font-semibold">
          <div>Sectors</div>
          <div className="text-right">Change %</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-700">
          {sortedSectors.map((sector) => {
            const percentage = parsePercentage(sector.changesPercentage)
            const isPositive = percentage >= 0
            const colorClass = isPositive ? 'text-green-500' : 'text-red-500'
            const sign = isPositive ? '+' : ''

            return (
              <div
                key={sector.sector}
                className="grid grid-cols-2 gap-3 px-4 py-1 hover:bg-gray-750 transition-colors"
              >
                <div className="text-blue-400 font-medium text-xs">{sector.sector}</div>
                <div className={`text-right ${colorClass} text-xs`}>
                  {sign}{percentage.toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
