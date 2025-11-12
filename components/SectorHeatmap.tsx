'use client'

import { useState } from 'react'

interface SectorData {
  sector: string
  changesPercentage: string
}

interface SectorHeatmapProps {
  sectors: SectorData[]
}

export default function SectorHeatmap({ sectors }: SectorHeatmapProps) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null)

  const parsePercentage = (percentStr: string): number => {
    return parseFloat(percentStr.replace('%', ''))
  }

  const getTextColorClass = (percentage: number): string => {
    if (percentage >= 0.5) return 'text-green-600 dark:text-green-400'
    if (percentage > 0) return 'text-green-500 dark:text-green-500'
    if (percentage === 0) return 'text-gray-600 dark:text-gray-400'
    if (percentage > -0.5) return 'text-red-500 dark:text-red-500'
    return 'text-red-600 dark:text-red-400'
  }

  if (sectors.length === 0) {
    return (
      <div className="w-full">
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
    return bPercent - aPercent // Reverse order for vertical display
  })

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-4">
        {/* Vertical Column Heatmap */}
        <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
          {sortedSectors.map((sector) => {
            const percentage = parsePercentage(sector.changesPercentage)
            const textColorClass = getTextColorClass(percentage)
            const sign = percentage >= 0 ? '+' : ''

            return (
              <button
                key={sector.sector}
                onClick={() => setSelectedSector(selectedSector === sector.sector ? null : sector.sector)}
                className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-between w-full text-left`}
                title={`${sector.sector}: ${sign}${percentage.toFixed(2)}%`}
              >
                <div className="text-xs font-semibold text-left text-gray-900 dark:text-white">
                  {sector.sector}
                </div>
                <div className={`text-sm font-bold ml-4 flex-shrink-0 ${textColorClass}`}>
                  {sign}{percentage.toFixed(2)}%
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected Sector Details */}
        {selectedSector && (
          <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-800 rounded text-center">
            <div className="text-xs text-gray-700 dark:text-gray-300 font-semibold">
              Selected: {selectedSector}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
