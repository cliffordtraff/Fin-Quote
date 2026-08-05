/**
 * Market hours utilities for determining current trading session
 */

import {
  isUsMarketEarlyClose,
  isUsMarketTradingDay,
} from '@/lib/market-calendar'

export type MarketSession = 'premarket' | 'cash' | 'afterhours' | 'closed'

export interface MarketStatus {
  session: MarketSession
  isWeekend: boolean
  isFetchingEnabled: boolean
  nextSessionStart: Date | null
  currentTimeET: string
}

// Time boundaries in minutes from midnight (Eastern Time)
const PREMARKET_START = 4 * 60        // 4:00 AM
const CASH_START = 9 * 60 + 30        // 9:30 AM
const CASH_END = 16 * 60              // 4:00 PM
const AFTERHOURS_END = 20 * 60        // 8:00 PM

/**
 * Get the current time in Eastern timezone
 */
function getEasternTime(): Date {
  const now = new Date()
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

function getEasternParts(referenceDate: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(referenceDate)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const shifted = new Date(`${dateStr}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays)
  return formatDateString(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  )
}

function isWeekendDateString(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00Z`)
  const weekday = d.getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * Determine current market session based on Eastern Time
 */
export function getMarketStatus(referenceDate: Date = new Date()): MarketStatus {
  const et = new Date(referenceDate.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  const day = et.getDay() // 0 = Sunday, 6 = Saturday
  const hour = et.getHours()
  const minute = et.getMinutes()
  const timeInMinutes = hour * 60 + minute

  const currentTimeET = et.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  // Weekend check
  const isWeekend = day === 0 || day === 6
  const tradingDate = formatDateString(
    et.getFullYear(),
    et.getMonth() + 1,
    et.getDate(),
  )
  if (!isUsMarketTradingDay(tradingDate)) {
    return {
      session: 'closed',
      isWeekend,
      isFetchingEnabled: false,
      nextSessionStart: getNextTradingDayPremarket(et),
      currentTimeET
    }
  }

  // Determine session based on time
  if (timeInMinutes < PREMARKET_START) {
    // Before 4:00 AM - closed
    return {
      session: 'closed',
      isWeekend: false,
      isFetchingEnabled: false,
      nextSessionStart: getTimeToday(et, 4, 0),
      currentTimeET
    }
  } else if (timeInMinutes < CASH_START) {
    // 4:00 AM - 9:30 AM - premarket
    return {
      session: 'premarket',
      isWeekend: false,
      isFetchingEnabled: true,
      nextSessionStart: null,
      currentTimeET
    }
  } else if (
    timeInMinutes < (isUsMarketEarlyClose(tradingDate) ? 13 * 60 : CASH_END)
  ) {
    // 9:30 AM - 4:00 PM - cash/regular session
    return {
      session: 'cash',
      isWeekend: false,
      isFetchingEnabled: true,
      nextSessionStart: null,
      currentTimeET
    }
  } else if (timeInMinutes < AFTERHOURS_END) {
    // 4:00 PM - 8:00 PM - after-hours
    return {
      session: 'afterhours',
      isWeekend: false,
      isFetchingEnabled: true,
      nextSessionStart: null,
      currentTimeET
    }
  } else {
    // After 8:00 PM - closed
    return {
      session: 'closed',
      isWeekend: false,
      isFetchingEnabled: false,
      nextSessionStart: getNextDayPremarket(et),
      currentTimeET
    }
  }
}

/**
 * Get the current trading date (handles after-midnight edge case)
 * Before 4am ET, we consider it the previous trading day
 */
export function getTradingDate(referenceDate: Date = new Date()): string {
  const { year, month, day, hour } = getEasternParts(referenceDate)
  let tradingDate = formatDateString(year, month, day)

  if (hour < 4) {
    tradingDate = shiftDateString(tradingDate, -1)
  }

  while (!isUsMarketTradingDay(tradingDate)) {
    tradingDate = shiftDateString(tradingDate, -1)
  }

  return tradingDate
}

/**
 * Get a specific time today
 */
function getTimeToday(now: Date, hour: number, minute: number): Date {
  const result = new Date(now)
  result.setHours(hour, minute, 0, 0)
  return result
}

/**
 * Get next day's premarket start (4am ET)
 */
function getNextDayPremarket(now: Date): Date {
  const next = new Date(now)
  next.setDate(next.getDate() + 1)

  while (!isUsMarketTradingDay(formatDateString(
    next.getFullYear(),
    next.getMonth() + 1,
    next.getDate(),
  ))) {
    next.setDate(next.getDate() + 1)
  }

  next.setHours(4, 0, 0, 0)
  return next
}

/**
 * Get next Monday's premarket start (4am ET)
 */
function getNextTradingDayPremarket(now: Date): Date {
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  while (!isUsMarketTradingDay(formatDateString(
    next.getFullYear(),
    next.getMonth() + 1,
    next.getDate(),
  ))) {
    next.setDate(next.getDate() + 1)
  }
  next.setHours(4, 0, 0, 0)
  return next
}

/**
 * Check if a given session should be actively fetching right now
 */
export function isSessionActive(session: 'premarket' | 'cash' | 'afterhours'): boolean {
  const status = getMarketStatus()
  return status.isFetchingEnabled && status.session === session
}

/**
 * Get human-readable session label
 */
export function getSessionLabel(session: MarketSession): string {
  switch (session) {
    case 'premarket':
      return 'Pre-Market'
    case 'cash':
      return 'Regular Hours'
    case 'afterhours':
      return 'After-Hours'
    case 'closed':
      return 'Market Closed'
  }
}

/**
 * Get session time range as human-readable string
 */
export function getSessionTimeRange(session: 'premarket' | 'cash' | 'afterhours'): string {
  switch (session) {
    case 'premarket':
      return '4:00 AM - 9:30 AM ET'
    case 'cash':
      return '9:30 AM - 4:00 PM ET'
    case 'afterhours':
      return '4:00 PM - 8:00 PM ET'
  }
}
