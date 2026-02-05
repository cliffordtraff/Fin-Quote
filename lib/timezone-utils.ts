/**
 * Utilities for converting market times (ET) to user's local timezone
 */

// Market session times in ET (24-hour format)
const MARKET_TIMES_ET = {
  premarket: { start: { hour: 4, minute: 0 }, end: { hour: 9, minute: 30 } },
  cash: { start: { hour: 9, minute: 30 }, end: { hour: 16, minute: 0 } },
  afterhours: { start: { hour: 16, minute: 0 }, end: { hour: 20, minute: 0 } },
} as const

type SessionType = keyof typeof MARKET_TIMES_ET

/**
 * Convert a time from ET to a target timezone
 * Returns a formatted time string like "6:30 AM"
 */
export function convertETtoTimezone(
  hour: number,
  minute: number,
  targetTimezone: string
): string {
  // Create a date in ET
  const now = new Date()
  const etDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
  const [month, day, year] = etDateStr.split('/').map(Number)

  // Create date object for the ET time
  const etDate = new Date(year, month - 1, day, hour, minute, 0, 0)

  // Get the offset difference and convert
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  // We need to find the actual moment in time that corresponds to this ET time
  // Create a reference point in ET
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utcNow = now

  // Calculate ET offset in ms
  const etOffset = etNow.getTime() - utcNow.getTime()

  // Create the target time: start with today's date, set the ET time, adjust for offset
  const targetDate = new Date(year, month - 1, day, hour, minute, 0, 0)
  // Adjust to UTC then format in target timezone
  const utcTime = new Date(targetDate.getTime() - etOffset)

  return targetFormatter.format(utcTime)
}

/**
 * Get session time range in user's timezone
 * Returns formatted string like "6:30 AM - 1:00 PM"
 */
export function getSessionTimeRange(
  session: SessionType,
  targetTimezone: string
): string {
  const times = MARKET_TIMES_ET[session]
  const start = convertETtoTimezone(times.start.hour, times.start.minute, targetTimezone)
  const end = convertETtoTimezone(times.end.hour, times.end.minute, targetTimezone)
  return `${start} - ${end}`
}

/**
 * Get session time range with both local and ET times
 * Returns formatted string like "6:30 AM - 1:00 PM (9:30 AM - 4:00 PM ET)"
 */
export function getSessionTimeRangeWithET(
  session: SessionType,
  targetTimezone: string
): { local: string; et: string } {
  const times = MARKET_TIMES_ET[session]

  const localStart = convertETtoTimezone(times.start.hour, times.start.minute, targetTimezone)
  const localEnd = convertETtoTimezone(times.end.hour, times.end.minute, targetTimezone)

  const etStart = convertETtoTimezone(times.start.hour, times.start.minute, 'America/New_York')
  const etEnd = convertETtoTimezone(times.end.hour, times.end.minute, 'America/New_York')

  return {
    local: `${localStart} - ${localEnd}`,
    et: `${etStart} - ${etEnd} ET`,
  }
}

/**
 * Format a Date object in the user's timezone
 */
export function formatTimeInTimezone(
  date: Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }

  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    ...defaultOptions,
    ...options,
  })
}

/**
 * Get short session labels with local time hint
 */
export function getSessionLabels(targetTimezone: string): Record<SessionType, { short: string; tooltip: string }> {
  return {
    premarket: {
      short: 'Pre',
      tooltip: `Pre-market: ${getSessionTimeRange('premarket', targetTimezone)}`,
    },
    cash: {
      short: 'Reg',
      tooltip: `Regular: ${getSessionTimeRange('cash', targetTimezone)}`,
    },
    afterhours: {
      short: 'AH',
      tooltip: `After-hours: ${getSessionTimeRange('afterhours', targetTimezone)}`,
    },
  }
}
