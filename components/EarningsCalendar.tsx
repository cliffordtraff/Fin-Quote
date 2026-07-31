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
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            No upcoming earnings...
          </div>
        </div>
      </div>
    )
  }

  const displayCount = expanded ? 15 : 6

  return (
    <div className="h-[400px] w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-200 px-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Earnings Calendar
        </h2>
        <p className="text-right text-xs text-gray-500 dark:text-gray-400">
          {summary || `${totalCount || earnings.length} (${Math.round(((totalCount || earnings.length) / 500) * 100)}%) of the S&P 500 is reporting this week`}
        </p>
      </div>
      <div className="h-[calc(400px-56px)] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
        {earnings.slice(0, displayCount).map((earning, index) => {
          const { month, day, full } = formatDate(earning.date)
          const timeLabel = getTimeLabel(earning.time)

          return (
            <div
              key={`${earning.symbol}-${index}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {/* Date box */}
              <div className="flex h-8 w-8 flex-col items-center justify-center rounded bg-gray-100 dark:bg-gray-800">
                <span className="text-[8px] font-medium text-sage-600 dark:text-sage-400">{month}</span>
                <span className="text-xs font-semibold text-sage-600 dark:text-sage-400">{day}</span>
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
