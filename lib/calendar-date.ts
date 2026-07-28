const EASTERN_TIME_ZONE = 'America/New_York'
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const easternDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getEasternCalendarDate(now: Date = new Date()): string {
  const parts = easternDateFormatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Unable to resolve the Eastern calendar date')
  }

  return `${year}-${month}-${day}`
}

export function shiftIsoCalendarDate(date: string, deltaDays: number): string {
  if (!ISO_DATE_PATTERN.test(date) || !Number.isInteger(deltaDays)) {
    throw new Error('Expected an ISO calendar date and an integer day offset')
  }

  const shifted = new Date(`${date}T12:00:00Z`)

  if (Number.isNaN(shifted.getTime())) {
    throw new Error('Invalid ISO calendar date')
  }

  shifted.setUTCDate(shifted.getUTCDate() + deltaDays)
  return shifted.toISOString().slice(0, 10)
}

export function getEasternCalendarDateRange(
  lookbackDays: number,
  now: Date = new Date()
): { fromDate: string; toDate: string } {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 0) {
    throw new Error('Lookback days must be a non-negative integer')
  }

  const toDate = getEasternCalendarDate(now)

  return {
    fromDate: shiftIsoCalendarDate(toDate, -lookbackDays),
    toDate,
  }
}
