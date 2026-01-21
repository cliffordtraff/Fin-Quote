'use client'

import { useState, useEffect } from 'react'

interface MarketSession {
  name: string
  timezone: string
  openHour: number  // In local market time (24h format)
  closeHour: number // In local market time (24h format)
  openMinute?: number
  closeMinute?: number
}

const MARKETS: MarketSession[] = [
  { name: 'Sydney', timezone: 'Australia/Sydney', openHour: 10, closeHour: 16 },
  { name: 'Tokyo', timezone: 'Asia/Tokyo', openHour: 9, closeHour: 15 },
  { name: 'London', timezone: 'Europe/London', openHour: 8, closeHour: 16, closeMinute: 30 },
  { name: 'New York', timezone: 'America/New_York', openHour: 9, closeHour: 16, openMinute: 30 },
]

// Timeline spans 24 hours, starting from 5pm ET (17:00)
const TIMELINE_START_HOUR = 17 // 5pm ET
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

  // Check if it's a weekday
  const day = localTime.getDay()
  if (day === 0 || day === 6) return false // Weekend

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}

function getMarketBarPosition(market: MarketSession, etNow: Date): { left: number; width: number } {
  // Convert market open/close times to ET for positioning
  const marketDate = new Date()

  // Get market open time in ET
  const openLocal = new Date(marketDate)
  openLocal.setHours(market.openHour, market.openMinute || 0, 0, 0)
  const openInMarketTZ = new Date(openLocal.toLocaleString('en-US', { timeZone: market.timezone }))

  // Convert to ET
  const openET = new Date(new Date(
    marketDate.getFullYear(),
    marketDate.getMonth(),
    marketDate.getDate(),
    market.openHour,
    market.openMinute || 0
  ).toLocaleString('en-US', { timeZone: market.timezone }))

  const closeET = new Date(new Date(
    marketDate.getFullYear(),
    marketDate.getMonth(),
    marketDate.getDate(),
    market.closeHour,
    market.closeMinute || 0
  ).toLocaleString('en-US', { timeZone: market.timezone }))

  // Calculate hours offset from timeline start (5pm ET)
  const getHoursFromStart = (date: Date, timezone: string) => {
    const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
    const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }))

    // Get the market's local time
    const marketLocal = new Date(date.toLocaleString('en-US', { timeZone: market.timezone }))

    // Convert market hours to ET
    const marketOpenInET = convertToET(market.openHour, market.openMinute || 0, market.timezone)
    const marketCloseInET = convertToET(market.closeHour, market.closeMinute || 0, market.timezone)

    return { open: marketOpenInET, close: marketCloseInET }
  }

  const times = getHoursFromStart(marketDate, market.timezone)

  // Calculate position relative to 5pm ET start
  let openFromStart = times.open - TIMELINE_START_HOUR
  if (openFromStart < 0) openFromStart += 24

  let closeFromStart = times.close - TIMELINE_START_HOUR
  if (closeFromStart < 0) closeFromStart += 24
  if (closeFromStart < openFromStart) closeFromStart += 24

  const left = (openFromStart / HOURS_IN_TIMELINE) * 100
  const width = ((closeFromStart - openFromStart) / HOURS_IN_TIMELINE) * 100

  return { left, width }
}

function convertToET(hour: number, minute: number, fromTimezone: string): number {
  // Create a date in the source timezone
  const now = new Date()
  const dateInTZ = new Date(now.toLocaleString('en-US', { timeZone: fromTimezone }))
  dateInTZ.setHours(hour, minute, 0, 0)

  // Get the offset difference
  const tzDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
  const tzString = tzDate.toLocaleString('en-US', { timeZone: fromTimezone })
  const etString = new Date(tzString).toLocaleString('en-US', { timeZone: 'America/New_York' })

  // Simple offset calculation
  const offsets: Record<string, number> = {
    'Australia/Sydney': 16, // Sydney is ~16 hours ahead of ET
    'Asia/Tokyo': 14,       // Tokyo is ~14 hours ahead of ET
    'Europe/London': 5,     // London is ~5 hours ahead of ET
    'America/New_York': 0
  }

  // Adjust for DST roughly - this is simplified
  const offset = offsets[fromTimezone] || 0
  let etHour = hour - offset
  if (etHour < 0) etHour += 24
  if (etHour >= 24) etHour -= 24

  return etHour + minute / 60
}

function getCurrentTimePosition(): number {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const currentHour = etNow.getHours() + etNow.getMinutes() / 60

  let hoursFromStart = currentHour - TIMELINE_START_HOUR
  if (hoursFromStart < 0) hoursFromStart += 24

  return (hoursFromStart / HOURS_IN_TIMELINE) * 100
}

export default function MarketSessions() {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

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

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden self-start" style={{ width: '700px' }}>
      {/* Header */}
      <div className="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Market Hours</h2>
      </div>

      {/* Timeline Header */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-0.5 relative border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
          {timelineHours.map(({ label, position }) => (
            <span key={label} style={{ position: 'absolute', left: `calc(${position}% + 12px)`, transform: 'translateX(-50%)' }}>
              {label}
            </span>
          ))}
        </div>
        <div className="h-3"></div>
      </div>

      {/* Market Bars */}
      <div className="relative px-3 pt-2 pb-1 bg-white dark:bg-[rgb(33,33,33)]" style={{ height: '112px' }}>
        {/* Current time indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-10"
          style={{ left: `calc(${currentTimePos}% + 12px)` }}
        />

        {/* Market session bars */}
        {MARKETS.map((market, index) => {
          const { left, width } = getMarketBarPosition(market, currentTime)
          const isOpen = isMarketOpen(market)
          const localTime = formatLocalTime(market.timezone)

          return (
            <div
              key={market.name}
              className={`absolute h-6 rounded flex items-center px-1.5 gap-1 whitespace-nowrap overflow-hidden ${
                isOpen
                  ? 'bg-green-200 dark:bg-green-900/50'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
              style={{
                left: `calc(${left}% + 12px)`,
                width: `${width}%`,
                top: `${4 + index * 26}px`,
              }}
            >
              <span className={`font-semibold text-[10px] ${isOpen ? 'text-green-800 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {market.name}
              </span>
              <span className={`text-[10px] ${isOpen ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                {localTime}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
