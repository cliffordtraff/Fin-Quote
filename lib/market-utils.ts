export type MarketSession = 'premarket' | 'regular' | 'afterhours' | 'closed'

// NYSE Market Holidays for 2025
// Source: https://www.nyse.com/markets/hours-calendars
export const MARKET_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // Martin Luther King Jr. Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving Day
  '2025-12-25', // Christmas Day
]

// Early close dates (1:00 PM ET close)
export const EARLY_CLOSE_DATES_2025 = [
  '2025-07-03',  // Day before Independence Day
  '2025-11-28',  // Day after Thanksgiving (Black Friday)
  '2025-12-24',  // Christmas Eve
]

/**
 * Check if a given date is a NYSE market holiday
 */
export function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD format
  return MARKET_HOLIDAYS_2025.includes(dateStr)
}

/**
 * Check if a given date is an early close day
 */
export function isEarlyCloseDay(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return EARLY_CLOSE_DATES_2025.includes(dateStr)
}

/**
 * Get the current time in Eastern Time
 * Returns { hour, minute, day } in ET
 */
export function getEasternTime(): { hour: number; minute: number; day: number; date: Date } {
  const now = new Date()

  // Convert to Eastern Time using Intl.DateTimeFormat
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  })

  const parts = etFormatter.formatToParts(now)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
  const weekday = parts.find(p => p.type === 'weekday')?.value || ''

  // Convert weekday to day number (0 = Sunday, 6 = Saturday)
  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  }
  const day = dayMap[weekday] || 0

  // Get the full date object in ET
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  return { hour, minute, day, date: etDate }
}

/**
 * Get the current market session
 * Returns: 'premarket' | 'regular' | 'afterhours' | 'closed'
 */
export function getCurrentMarketSession(): MarketSession {
  const { hour, minute, day, date } = getEasternTime()
  const timeInMinutes = hour * 60 + minute

  // Check if it's a weekend
  if (day === 0 || day === 6) {
    return 'closed'
  }

  // Check if it's a market holiday
  if (isMarketHoliday(date)) {
    return 'closed'
  }

  // Check if it's an early close day
  const isEarlyClose = isEarlyCloseDay(date)

  // Define session times in minutes from midnight
  const PRE_MARKET_START = 4 * 60      // 4:00 AM
  const REGULAR_OPEN = 9 * 60 + 30     // 9:30 AM
  const REGULAR_CLOSE = isEarlyClose ? 13 * 60 : 16 * 60  // 1:00 PM or 4:00 PM
  const AFTER_HOURS_END = 20 * 60      // 8:00 PM

  // Determine session based on time
  if (timeInMinutes >= PRE_MARKET_START && timeInMinutes < REGULAR_OPEN) {
    return 'premarket'
  } else if (timeInMinutes >= REGULAR_OPEN && timeInMinutes < REGULAR_CLOSE) {
    return 'regular'
  } else if (timeInMinutes >= REGULAR_CLOSE && timeInMinutes < AFTER_HOURS_END) {
    return 'afterhours'
  } else {
    return 'closed'
  }
}

/**
 * Check if the market is currently open (regular hours)
 */
export function isMarketOpen(): boolean {
  return getCurrentMarketSession() === 'regular'
}

/**
 * Check if extended hours trading is active (pre-market or after-hours)
 */
export function isExtendedHours(): boolean {
  const session = getCurrentMarketSession()
  return session === 'premarket' || session === 'afterhours'
}

/**
 * Get the next market open time
 * Returns a Date object representing the next market open
 */
export function getNextMarketOpen(): Date {
  const { date } = getEasternTime()
  const session = getCurrentMarketSession()

  let nextOpen = new Date(date)

  if (session === 'closed') {
    // If closed overnight, next open is 9:30 AM same day (if weekday) or Monday
    nextOpen.setHours(9, 30, 0, 0)

    // If it's weekend or holiday, find next weekday
    while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6 || isMarketHoliday(nextOpen)) {
      nextOpen.setDate(nextOpen.getDate() + 1)
      nextOpen.setHours(9, 30, 0, 0)
    }
  } else if (session === 'premarket') {
    // Next open is 9:30 AM today
    nextOpen.setHours(9, 30, 0, 0)
  } else if (session === 'regular') {
    // Already open, return null or current time
    return new Date()
  } else if (session === 'afterhours') {
    // Next open is 9:30 AM tomorrow
    nextOpen.setDate(nextOpen.getDate() + 1)
    nextOpen.setHours(9, 30, 0, 0)

    // Skip weekends and holidays
    while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6 || isMarketHoliday(nextOpen)) {
      nextOpen.setDate(nextOpen.getDate() + 1)
    }
  }

  return nextOpen
}

/**
 * Get time until next market open in human-readable format
 */
export function getTimeUntilMarketOpen(): string {
  const now = new Date()
  const nextOpen = getNextMarketOpen()
  const diff = nextOpen.getTime() - now.getTime()

  if (diff <= 0) {
    return 'Market is open'
  }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

/**
 * Get a user-friendly label for the current market session
 */
export function getMarketSessionLabel(): string {
  const session = getCurrentMarketSession()

  switch (session) {
    case 'premarket':
      return 'PRE-MARKET'
    case 'regular':
      return 'MARKET OPEN'
    case 'afterhours':
      return 'AFTER-HOURS'
    case 'closed':
      return 'MARKET CLOSED'
  }
}

/**
 * Get badge color for current market session
 * Returns Tailwind CSS classes
 */
export function getMarketSessionBadgeColor(): string {
  const session = getCurrentMarketSession()

  switch (session) {
    case 'premarket':
      return 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
    case 'regular':
      return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
    case 'afterhours':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
    case 'closed':
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
  }
}
