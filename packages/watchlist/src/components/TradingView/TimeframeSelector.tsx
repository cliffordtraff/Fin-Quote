'use client'

import { Timeframe } from '@watchlist/types/chart'
import { formatTimeframe } from '@watchlist/utils/chart-helpers'

interface TimeframeSelectorProps {
  currentTimeframe: Timeframe
  onChange: (timeframe: Timeframe) => void
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

/**
 * Timeframe selector component for switching chart intervals
 */
export function TimeframeSelector({ currentTimeframe, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-md p-1">
        {TIMEFRAMES.map((timeframe) => (
          <button
            key={timeframe}
            onClick={() => onChange(timeframe)}
            className={`
              px-3 py-1 rounded text-sm font-medium transition-colors
              ${
                currentTimeframe === timeframe
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
              }
            `}
            title={formatTimeframe(timeframe)}
          >
            {timeframe}
          </button>
        ))}
      </div>
    </div>
  )
}