'use client'

interface EconomicEvent {
  date: string
  country: string
  event: string
  currency: string
  previous: number | null
  estimate: number | null
  actual: number | null
  impact: string
  unit: string
}

interface EconomicCalendarProps {
  events: EconomicEvent[]
  expanded?: boolean
}

export default function EconomicCalendar({ events, expanded = false }: EconomicCalendarProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const dateKey = `${month} ${day}` // For grouping
    return { month, day, time, dateKey }
  }

  const formatValue = (value: number | null, unit: string) => {
    if (value === null) return 'N/A'
    return `${value}${unit}`
  }

  if (events.length === 0) {
    return (
      <div style={{ width: expanded ? '100%' : '340px' }}>
        <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-center text-gray-500 dark:text-gray-400 text-xs">
            Loading economic events...
          </div>
        </div>
      </div>
    )
  }

  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const { dateKey } = formatDate(event.date)
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(event)
    return acc
  }, {} as Record<string, EconomicEvent[]>)

  return (
    <div style={{ width: expanded ? '100%' : '340px' }}>
      <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h2 className={`font-semibold text-gray-700 dark:text-gray-300 ${expanded ? 'text-sm' : 'text-[10px]'}`}>
            Economic Calendar (US)
          </h2>
        </div>

        <div className={`space-y-4 ${expanded ? 'p-5' : 'p-4'}`}>
          {Object.entries(groupedEvents).map(([dateKey, dateEvents]) => {
            const { month, day } = formatDate(dateEvents[0].date)

            return (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                    {month}
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white leading-none">
                    {day}
                  </div>
                </div>

                {/* Events for this date */}
                <div className="space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                  {dateEvents.map((event, index) => {
                    const { time } = formatDate(event.date)
                    const impactColor = event.impact === 'High'
                      ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                      : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'

                    return (
                      <div key={index} className="p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-start gap-2">
                          {/* Time */}
                          <div className="text-[9px] text-gray-500 dark:text-gray-400 min-w-[50px]">
                            {time}
                          </div>

                          {/* Event Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                {event.event}
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${impactColor}`}>
                                {event.impact}
                              </span>
                            </div>

                            <div className="flex gap-3 text-[10px] text-gray-600 dark:text-gray-400">
                              {event.previous !== null && (
                                <div>
                                  <span className="font-semibold">Prev:</span> {formatValue(event.previous, event.unit)}
                                </div>
                              )}
                              {event.estimate !== null && (
                                <div>
                                  <span className="font-semibold">Est:</span> {formatValue(event.estimate, event.unit)}
                                </div>
                              )}
                              {event.actual !== null && (
                                <div className="font-bold text-blue-600 dark:text-blue-400">
                                  <span>Actual:</span> {formatValue(event.actual, event.unit)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
