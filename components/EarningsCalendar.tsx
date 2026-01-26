'use client'

import type { EarningsData } from '@/app/actions/earnings-calendar'

interface EarningsCalendarProps {
  earnings: EarningsData[]
  expanded?: boolean
  summary?: string
  totalCount?: number  // Total companies reporting (before filtering)
}

function formatDate(dateStr: string): { month: string; day: number; full: string; time?: string } {
  const date = new Date(dateStr + 'T12:00:00')
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate()
  const full = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return { month, day, full }
}

function getTimeLabel(time: 'bmo' | 'amc' | 'dmh' | null): string | null {
  switch (time) {
    case 'bmo':
      return 'Before Open'
    case 'amc':
      return 'After Close'
    case 'dmh':
      return 'During Hours'
    default:
      return null
  }
}

export default function EarningsCalendar({ earnings, expanded = false, summary, totalCount }: EarningsCalendarProps) {
  if (earnings.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            No upcoming earnings...
          </div>
        </div>
      </div>
    )
  }

  const displayCount = expanded ? 15 : 6

  return (
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ height: '400px' }}>
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className={`font-semibold text-gray-700 dark:text-gray-300 ${expanded ? 'text-sm' : 'text-[10px]'}`}>
          Earnings Calendar
        </h2>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic">
          {summary || `${totalCount || earnings.length} (${Math.round(((totalCount || earnings.length) / 500) * 100)}%) of the S&P 500 is reporting this week`}
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-y-auto" style={{ height: 'calc(100% - 37px)' }}>
        {earnings.slice(0, displayCount).map((earning, index) => {
          const { month, day, full } = formatDate(earning.date)
          const timeLabel = getTimeLabel(earning.time)

          return (
            <div
              key={`${earning.symbol}-${index}`}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              {/* Date box */}
              <div className="flex flex-col items-center justify-center w-8 h-8 rounded bg-gray-100 dark:bg-gray-800">
                <span className="text-[8px] font-medium text-blue-600 dark:text-blue-400">{month}</span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{day}</span>
              </div>

              {/* Company info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                  {earning.name}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {timeLabel || 'TBD'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
