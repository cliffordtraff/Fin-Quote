'use client'

import { useState, useEffect } from 'react'
import type { GlobalIndexQuote, FuturesQuote } from '@/app/actions/global-indices'

interface MarketSession {
  name: string
  timezone: string
  openHour: number
  closeHour: number
  openMinute?: number
  closeMinute?: number
  // Extended hours (US only)
  preMarketOpen?: number
  preMarketOpenMinute?: number
  afterHoursClose?: number
}

interface MarketSessionsProps {
  indexQuotes?: GlobalIndexQuote[]
  futuresQuotes?: FuturesQuote[]
}

const MARKETS: MarketSession[] = [
  { name: 'Sydney', timezone: 'Australia/Sydney', openHour: 10, closeHour: 16 },
  { name: 'Tokyo', timezone: 'Asia/Tokyo', openHour: 9, closeHour: 15 },
  { name: 'Hong Kong', timezone: 'Asia/Hong_Kong', openHour: 9, closeHour: 16, openMinute: 30 },
  { name: 'Shanghai', timezone: 'Asia/Shanghai', openHour: 9, closeHour: 15, openMinute: 30 },
  { name: 'Mumbai', timezone: 'Asia/Kolkata', openHour: 9, closeHour: 15, openMinute: 15, closeMinute: 30 },
  { name: 'Frankfurt', timezone: 'Europe/Berlin', openHour: 9, closeHour: 17, closeMinute: 30 },
  { name: 'London', timezone: 'Europe/London', openHour: 8, closeHour: 16, closeMinute: 30 },
  {
    name: 'New York',
    timezone: 'America/New_York',
    openHour: 9,
    closeHour: 16,
    openMinute: 30,
    preMarketOpen: 4,
    preMarketOpenMinute: 0,
    afterHoursClose: 20
  },
]

const TIMELINE_START_HOUR = 17
const HOURS_IN_TIMELINE = 24

function getLocalTime(timezone: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
}

function formatLocalTime(timezone: string): string {
  const date = new Date()
  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()
}

function isMarketOpen(market: MarketSession): boolean {
  const localTime = getLocalTime(market.timezone)
  const hours = localTime.getHours()
  const minutes = localTime.getMinutes()
  const currentMinutes = hours * 60 + minutes

  const openMinutes = market.openHour * 60 + (market.openMinute || 0)
  const closeMinutes = market.closeHour * 60 + (market.closeMinute || 0)

  const day = localTime.getDay()
  if (day === 0 || day === 6) return false

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}

function isWeekendInMarket(market: MarketSession): boolean {
  const localTime = getLocalTime(market.timezone)
  const day = localTime.getDay()
  return day === 0 || day === 6 // Sunday or Saturday
}

function isExtendedHours(market: MarketSession): 'pre' | 'after' | null {
  if (!market.preMarketOpen) return null

  const localTime = getLocalTime(market.timezone)
  const hours = localTime.getHours()
  const minutes = localTime.getMinutes()
  const currentMinutes = hours * 60 + minutes

  const preMarketMinutes = market.preMarketOpen * 60 + (market.preMarketOpenMinute || 0)
  const openMinutes = market.openHour * 60 + (market.openMinute || 0)
  const closeMinutes = market.closeHour * 60 + (market.closeMinute || 0)
  const afterHoursMinutes = (market.afterHoursClose || 20) * 60

  const day = localTime.getDay()
  if (day === 0 || day === 6) return null

  if (currentMinutes >= preMarketMinutes && currentMinutes < openMinutes) {
    return 'pre'
  }
  if (currentMinutes >= closeMinutes && currentMinutes < afterHoursMinutes) {
    return 'after'
  }
  return null
}

// Timezone offsets from ET (simplified - doesn't account for all DST variations)
const TZ_OFFSETS: Record<string, number> = {
  'Australia/Sydney': 16,
  'Asia/Tokyo': 14,
  'Asia/Hong_Kong': 13,
  'Asia/Shanghai': 13,
  'Asia/Kolkata': 10.5,
  'Europe/Berlin': 6,
  'Europe/London': 5,
  'America/New_York': 0
}

function convertToET(hour: number, minute: number, fromTimezone: string): number {
  const offset = TZ_OFFSETS[fromTimezone] || 0
  let etHour = hour - offset
  if (etHour < 0) etHour += 24
  if (etHour >= 24) etHour -= 24

  return etHour + minute / 60
}

function getMarketBarPosition(market: MarketSession): { left: number; width: number } {
  const marketOpenInET = convertToET(market.openHour, market.openMinute || 0, market.timezone)
  const marketCloseInET = convertToET(market.closeHour, market.closeMinute || 0, market.timezone)

  let openFromStart = marketOpenInET - TIMELINE_START_HOUR
  if (openFromStart < 0) openFromStart += 24

  let closeFromStart = marketCloseInET - TIMELINE_START_HOUR
  if (closeFromStart < 0) closeFromStart += 24
  if (closeFromStart < openFromStart) closeFromStart += 24

  const left = (openFromStart / HOURS_IN_TIMELINE) * 100
  const width = ((closeFromStart - openFromStart) / HOURS_IN_TIMELINE) * 100

  return { left, width }
}

function getExtendedHoursPosition(market: MarketSession, type: 'pre' | 'after'): { left: number; width: number } | null {
  if (!market.preMarketOpen) return null

  if (type === 'pre') {
    const preOpenET = convertToET(market.preMarketOpen, market.preMarketOpenMinute || 0, market.timezone)
    const marketOpenET = convertToET(market.openHour, market.openMinute || 0, market.timezone)

    let preFromStart = preOpenET - TIMELINE_START_HOUR
    if (preFromStart < 0) preFromStart += 24

    let openFromStart = marketOpenET - TIMELINE_START_HOUR
    if (openFromStart < 0) openFromStart += 24
    if (openFromStart < preFromStart) openFromStart += 24

    return {
      left: (preFromStart / HOURS_IN_TIMELINE) * 100,
      width: ((openFromStart - preFromStart) / HOURS_IN_TIMELINE) * 100
    }
  } else {
    const marketCloseET = convertToET(market.closeHour, market.closeMinute || 0, market.timezone)
    const afterCloseET = convertToET(market.afterHoursClose || 20, 0, market.timezone)

    let closeFromStart = marketCloseET - TIMELINE_START_HOUR
    if (closeFromStart < 0) closeFromStart += 24

    let afterFromStart = afterCloseET - TIMELINE_START_HOUR
    if (afterFromStart < 0) afterFromStart += 24
    if (afterFromStart < closeFromStart) afterFromStart += 24

    return {
      left: (closeFromStart / HOURS_IN_TIMELINE) * 100,
      width: ((afterFromStart - closeFromStart) / HOURS_IN_TIMELINE) * 100
    }
  }
}

function getCurrentTimePosition(): number {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const currentHour = etNow.getHours() + etNow.getMinutes() / 60

  let hoursFromStart = currentHour - TIMELINE_START_HOUR
  if (hoursFromStart < 0) hoursFromStart += 24

  return (hoursFromStart / HOURS_IN_TIMELINE) * 100
}

function formatPrice(price: number): string {
  if (price >= 10000) {
    return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function areFuturesOpen(): boolean {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etNow.getDay() // 0 = Sunday, 6 = Saturday
  const hours = etNow.getHours()
  const minutes = etNow.getMinutes()
  const currentMinutes = hours * 60 + minutes

  // Futures are closed:
  // - All day Saturday (day 6)
  // - Sunday before 6pm ET (day 0, before 18:00)
  // - Friday after 5pm ET (day 5, after 17:00)

  if (day === 6) return false // Saturday - closed
  if (day === 0 && currentMinutes < 18 * 60) return false // Sunday before 6pm - closed
  if (day === 5 && currentMinutes >= 17 * 60) return false // Friday after 5pm - closed

  return true
}

export default function MarketSessions({ indexQuotes = [], futuresQuotes = [] }: MarketSessionsProps) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const timelineHours = []
  for (let i = 0; i < HOURS_IN_TIMELINE; i += 2) {
    let hour = (TIMELINE_START_HOUR + i) % 24
    const ampm = hour >= 12 ? 'pm' : 'am'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    timelineHours.push({ hour, label: `${displayHour}${ampm}`, position: (i / HOURS_IN_TIMELINE) * 100 })
  }

  const currentTimePos = getCurrentTimePosition()

  // Create a map of market name to quote
  const quoteMap = new Map(indexQuotes.map(q => [q.market, q]))
  const futuresMap = new Map(futuresQuotes.map(q => [q.symbol, q]))

  // Futures trading hours (Sunday 6pm - Friday 5pm ET with 1hr break each day)
  // Simplified: show as continuous bar
  const futuresBarLeft = 0 // Starts at 5pm ET (timeline start)
  const futuresBarWidth = 100 // Full width (24 hours)

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden">
      {/* Header */}
      <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Global Market Hours</h2>
      </div>

      {/* Table View */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Market</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Index</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Local Time</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Change</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">% Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {MARKETS.map((market) => {
              const isOpen = isMarketOpen(market)
              const isWeekend = isWeekendInMarket(market)
              const extendedStatus = isExtendedHours(market)
              const localTime = formatLocalTime(market.timezone)
              const quote = quoteMap.get(market.name)

              let statusLabel = 'Closed'
              let statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'

              if (isWeekend) {
                statusLabel = 'Weekend'
                statusColor = 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500'
              } else if (isOpen) {
                statusLabel = 'Open'
                statusColor = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300'
              } else if (extendedStatus === 'pre') {
                statusLabel = 'Pre-Market'
                statusColor = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300'
              } else if (extendedStatus === 'after') {
                statusLabel = 'After-Hours'
                statusColor = 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
              }

              return (
                <tr key={market.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{market.name}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{quote?.name || '—'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{localTime}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {quote ? (
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatPrice(quote.price)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {quote ? (
                      <span className={`text-sm font-medium ${
                        quote.change >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {quote ? (
                      <span className={`text-sm font-medium ${
                        quote.changesPercentage >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {quote.changesPercentage >= 0 ? '+' : ''}{quote.changesPercentage.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Visual Timeline */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        {/* Timeline Header with Day Labels */}
        <div className="bg-gray-50 dark:bg-gray-800/50 px-4 pt-1 pb-1 relative border-b border-gray-200 dark:border-gray-700">
          {/* Day labels */}
          {(() => {
            const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            const today = days[etNow.getDay()]
            const tomorrow = days[(etNow.getDay() + 1) % 7]
            // Midnight is at position (24 - 17) / 24 * 100 = 29.17% (7 hours from 5pm)
            const midnightPos = ((24 - TIMELINE_START_HOUR) / HOURS_IN_TIMELINE) * 100

            return (
              <div className="flex justify-between text-[10px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                <span style={{ position: 'absolute', left: `calc(${midnightPos / 2}% + 16px)`, transform: 'translateX(-50%)' }}>
                  {today}
                </span>
                <span style={{ position: 'absolute', left: `calc(${midnightPos + (100 - midnightPos) / 2}% + 16px)`, transform: 'translateX(-50%)' }}>
                  {tomorrow}
                </span>
                {/* Midnight divider line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600"
                  style={{ left: `calc(${midnightPos}% + 16px)` }}
                />
              </div>
            )
          })()}
          {/* Hour labels */}
          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 relative">
            {timelineHours.map(({ label, position }) => (
              <span key={label} style={{ position: 'absolute', left: `calc(${position}% + 16px)`, transform: 'translateX(-50%)' }}>
                {label}
              </span>
            ))}
          </div>
          <div className="h-3"></div>
        </div>

        {/* Market Bars */}
        <div className="relative px-4 pt-3 pb-4 bg-white dark:bg-[rgb(33,33,33)] overflow-visible" style={{ height: `${32 + MARKETS.length * 36 + 70}px` }}>
          {/* Midnight divider line through bars */}
          {(() => {
            const midnightPos = ((24 - TIMELINE_START_HOUR) / HOURS_IN_TIMELINE) * 100
            return (
              <div
                className="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 z-10"
                style={{ left: `calc(${midnightPos}% + 16px)` }}
              />
            )
          })()}
          {/* Current time indicator */}
          <div
            className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-white/70 z-20"
            style={{ left: `calc(${currentTimePos}% + 16px)` }}
          />

          {/* Futures overlay bar (background) - only show when futures are open */}
          {areFuturesOpen() && (
            <div
              className="absolute h-full rounded opacity-10 bg-yellow-500 dark:bg-yellow-400"
              style={{
                left: `calc(${futuresBarLeft}% + 16px)`,
                width: `calc(${futuresBarWidth}% - 32px)`,
                top: 0,
              }}
            />
          )}

          {/* Market session bars */}
          {MARKETS.map((market, index) => {
            const { left, width } = getMarketBarPosition(market)
            const isOpen = isMarketOpen(market)
            const isWeekend = isWeekendInMarket(market)
            const extendedStatus = isExtendedHours(market)
            const localTime = formatLocalTime(market.timezone)
            const quote = quoteMap.get(market.name)
            const preMarketPos = getExtendedHoursPosition(market, 'pre')
            const afterHoursPos = getExtendedHoursPosition(market, 'after')

            const performanceText = quote ? formatPercent(quote.changesPercentage) : ''
            const isPositive = quote ? quote.changesPercentage >= 0 : true

            // Determine bar styling based on market state
            const getBarStyle = () => {
              if (isWeekend) return 'bg-gray-300/50 dark:bg-gray-800/50' // Weekend - more muted
              if (isOpen) return isPositive ? 'bg-green-200 dark:bg-green-900/50' : 'bg-red-200 dark:bg-red-900/50'
              return 'bg-gray-200 dark:bg-gray-700' // Closed but weekday
            }

            const getTextStyle = () => {
              if (isWeekend) return 'text-gray-400 dark:text-gray-600' // Weekend - muted
              if (isOpen) return isPositive ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
              return 'text-gray-600 dark:text-gray-400' // Closed but weekday
            }

            const getTimeStyle = () => {
              if (isWeekend) return 'text-gray-400 dark:text-gray-600'
              if (isOpen) return isPositive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
              return 'text-gray-500 dark:text-gray-500'
            }

            return (
              <div key={market.name}>
                {/* Pre-market bar (US only) - hide on weekends */}
                {preMarketPos && !isWeekend && (
                  <div
                    className={`absolute h-8 rounded-l flex items-center px-2 ${
                      extendedStatus === 'pre'
                        ? 'bg-blue-200/60 dark:bg-blue-900/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                    style={{
                      left: `calc(${preMarketPos.left}% + 16px)`,
                      width: `${preMarketPos.width}%`,
                      top: `${6 + index * 36}px`,
                    }}
                  >
                    <span className="text-[10px] text-gray-500 dark:text-gray-500">Pre</span>
                  </div>
                )}

                {/* Main market bar */}
                <div
                  className={`absolute h-8 flex items-center justify-between px-2 gap-2 whitespace-nowrap overflow-hidden ${getBarStyle()} ${preMarketPos && !isWeekend ? '' : 'rounded-l'} ${afterHoursPos && !isWeekend ? '' : 'rounded-r'}`}
                  style={{
                    left: `calc(${left}% + 16px)`,
                    width: `${width}%`,
                    top: `${6 + index * 36}px`,
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`font-semibold text-xs ${getTextStyle()}`}>
                      {market.name}
                    </span>
                    <span className={`text-[11px] ${getTimeStyle()}`}>
                      {localTime}
                      {isWeekend && <span className="ml-1 text-[9px]">(wknd)</span>}
                    </span>
                  </div>
                  {/* Performance percentage on the bar - hide on weekends */}
                  {quote && !isWeekend && (
                    <span className={`text-xs font-bold ${
                      isPositive
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {performanceText}
                    </span>
                  )}
                </div>

                {/* After-hours bar (US only) - hide on weekends */}
                {afterHoursPos && !isWeekend && (
                  <div
                    className={`absolute h-8 rounded-r flex items-center justify-end px-2 ${
                      extendedStatus === 'after'
                        ? 'bg-purple-200/60 dark:bg-purple-900/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                    style={{
                      left: `calc(${afterHoursPos.left}% + 16px)`,
                      width: `${afterHoursPos.width}%`,
                      top: `${6 + index * 36}px`,
                    }}
                  >
                    <span className="text-[10px] text-gray-500 dark:text-gray-500">AH</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Futures bars at the bottom */}
          <div className="absolute left-4 right-4 bottom-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Futures</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                areFuturesOpen()
                  ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {areFuturesOpen() ? 'Open' : 'Closed'}
              </span>
            </div>
            <div className="flex gap-3">
              {['ES', 'NQ'].map((symbol) => {
                const futures = futuresMap.get(symbol)
                const isPositive = futures ? futures.changesPercentage >= 0 : true
                const futuresOpen = areFuturesOpen()

                return (
                  <div
                    key={symbol}
                    className={`flex-1 h-7 rounded flex items-center justify-between px-3 ${
                      futuresOpen
                        ? isPositive
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${
                      futuresOpen
                        ? isPositive
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-red-700 dark:text-red-300'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {symbol}
                    </span>
                    {futures && (
                      <span className={`text-xs font-bold ${
                        futuresOpen
                          ? isPositive
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {formatPercent(futures.changesPercentage)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
