/**
 * Market hours utilities for determining current trading session
 */

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

/**
 * Determine current market session based on Eastern Time
 */
export function getMarketStatus(): MarketStatus {
  const et = getEasternTime()

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
  if (isWeekend) {
    return {
      session: 'closed',
      isWeekend: true,
      isFetchingEnabled: false,
      nextSessionStart: getNextMondayPremarket(et),
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
  } else if (timeInMinutes < CASH_END) {
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
export function getTradingDate(): string {
  const et = getEasternTime()

  // If before 4am ET, consider it previous trading day
  if (et.getHours() < 4) {
    et.setDate(et.getDate() - 1)
  }

  // Skip weekends (go back to Friday)
  while (et.getDay() === 0 || et.getDay() === 6) {
    et.setDate(et.getDate() - 1)
  }

  return et.toISOString().split('T')[0] // YYYY-MM-DD
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

  // Skip to Monday if next day is weekend
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1)
  }

  next.setHours(4, 0, 0, 0)
  return next
}

/**
 * Get next Monday's premarket start (4am ET)
 */
function getNextMondayPremarket(now: Date): Date {
  const next = new Date(now)
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  next.setDate(next.getDate() + daysUntilMonday)
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
