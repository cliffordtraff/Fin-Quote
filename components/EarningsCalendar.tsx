'use client'

import type { EarningsData } from '@/app/actions/earnings-calendar'

interface EarningsCalendarProps {
  earnings: EarningsData[]
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
      return '8:30 AM'
    case 'amc':
      return '4:00 PM'
    case 'dmh':
      return '12:00 PM'
    default:
      return null
  }
}

export default function EarningsCalendar({ earnings }: EarningsCalendarProps) {
  if (earnings.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '340px' }}>
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Earnings calendar</h2>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {earnings.slice(0, 6).map((earning, index) => {
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
                <p className="text-[10px] font-medium text-gray-900 dark:text-gray-100 truncate">
                  {earning.name}
                </p>
                <p className="text-[9px] text-gray-500 dark:text-gray-400">
                  {full}{timeLabel ? `, ${timeLabel}` : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
