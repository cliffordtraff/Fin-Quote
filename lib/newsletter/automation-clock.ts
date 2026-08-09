import {
  getUsMarketHolidayName,
  isUsMarketTradingDay,
} from '@/lib/market-calendar'

const DEFAULT_READY_BY_HOUR = 8
const RECOVERY_END_HOUR = 12

export interface NewsletterAutomationClock {
  marketDate: string
  weekday: string
  hour: number
  minute: number
  isWeekday: boolean
  isTradingDay: boolean
  holidayName: string | null
  isCollectionWindow: boolean
  isMorningReportWindow: boolean
}

export interface NewsletterAutomationWindow {
  readyByHour: number
  startHour: number
  shouldRun: boolean
  isLate: boolean
  hasEnded: boolean
}

/**
 * Side-effect-free market clock shared by cron and health routes. Keep this
 * module independent from the newsletter persistence/capture graph so a tiny
 * health function cannot trace local artifacts or credentials into its bundle.
 */
export function getNewsletterAutomationClock(
  now = new Date(),
): NewsletterAutomationClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = read('weekday')
  const hour = Number(read('hour'))
  const minute = Number(read('minute'))
  const isWeekday = !['Sat', 'Sun'].includes(weekday)
  const marketDate = `${read('year')}-${read('month')}-${read('day')}`
  const holidayName = getUsMarketHolidayName(marketDate)
  const isTradingDay = isWeekday && isUsMarketTradingDay(marketDate)
  return {
    weekday,
    marketDate,
    hour,
    minute,
    isWeekday,
    isTradingDay,
    holidayName,
    isCollectionWindow: isTradingDay && hour >= 5 && hour < 8,
    isMorningReportWindow:
      isTradingDay && hour >= 5 && hour < RECOVERY_END_HOUR,
  }
}

export function getNewsletterAutomationWindow(
  clock: NewsletterAutomationClock,
  generationHours: number[],
): NewsletterAutomationWindow {
  const normalized = generationHours
    .filter(Number.isFinite)
    .map((hour) => Math.max(0, Math.min(23, Math.floor(hour))))
  const readyByHour =
    normalized.length > 0
      ? Math.min(...normalized)
      : DEFAULT_READY_BY_HOUR
  const startHour = Math.max(0, readyByHour - 3)
  const minuteOfDay = clock.hour * 60 + clock.minute
  const startMinute = startHour * 60
  const deadlineMinute = readyByHour * 60
  const endMinute = RECOVERY_END_HOUR * 60
  return {
    readyByHour,
    startHour,
    shouldRun:
      clock.isTradingDay &&
      minuteOfDay >= startMinute &&
      minuteOfDay < endMinute,
    isLate:
      clock.isTradingDay &&
      minuteOfDay >= deadlineMinute &&
      minuteOfDay < endMinute,
    hasEnded: minuteOfDay >= endMinute,
  }
}
