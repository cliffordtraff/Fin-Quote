'use client'

interface SectorData {
  sector: string
  changesPercentage: string | number
}

interface SectorCardProps {
  sectors: SectorData[]
}

// Sector icons/abbreviations
const SECTOR_ABBREV: Record<string, string> = {
  'Technology': 'T',
  'Healthcare': 'H',
  'Financial Services': 'F',
  'Financials': 'F',
  'Consumer Cyclical': 'CC',
  'Consumer Defensive': 'CD',
  'Industrials': 'I',
  'Energy': 'E',
  'Utilities': 'U',
  'Real Estate': 'R',
  'Communication Services': 'CS',
  'Basic Materials': 'BM',
  'Materials': 'M',
}

export default function SectorCard({ sectors }: SectorCardProps) {
  if (sectors.length === 0) {
    return null
  }

  // Sort by performance (best to worst)
  const sortedSectors = [...sectors].sort((a, b) => {
    const aVal = typeof a.changesPercentage === 'string' ? parseFloat(a.changesPercentage) : a.changesPercentage
    const bVal = typeof b.changesPercentage === 'string' ? parseFloat(b.changesPercentage) : b.changesPercentage
    return (bVal || 0) - (aVal || 0)
  })

  return (
    <div className="bg-white dark:bg-[rgb(40,40,40)] rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sectors</div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {sortedSectors.map((sector) => {
          const changeValue = typeof sector.changesPercentage === 'string'
            ? parseFloat(sector.changesPercentage)
            : sector.changesPercentage
          const isPositive = (changeValue || 0) >= 0
          const abbrev = SECTOR_ABBREV[sector.sector] || sector.sector.charAt(0)
          const formattedChange = changeValue !== undefined && !isNaN(changeValue)
            ? changeValue.toFixed(2)
            : '0.00'

          return (
            <div
              key={sector.sector}
              className="flex items-center justify-between py-2"
            >
              {/* Left: Icon circle + name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {abbrev}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {sector.sector}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Sector
                  </div>
                </div>
              </div>

              {/* Right: Change percentage */}
              <div className="text-right">
                <div className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{formattedChange}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
