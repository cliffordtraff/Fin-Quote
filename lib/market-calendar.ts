const DAY_MS = 86_400_000

interface MarketHoliday {
  date: string
  name: string
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function observedDate(date: Date): Date {
  if (date.getUTCDay() === 6) return addDays(date, -1)
  if (date.getUTCDay() === 0) return addDays(date, 1)
  return date
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): Date {
  const first = utcDate(year, month, 1)
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return utcDate(year, month, 1 + offset + (occurrence - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utcDate(year, month + 1, 0)
  const offset = (last.getUTCDay() - weekday + 7) % 7
  return utcDate(year, month, last.getUTCDate() - offset)
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month - 1, day)
}

function holidaysForYear(year: number): MarketHoliday[] {
  const holidays: Array<[Date, string]> = [
    [observedDate(utcDate(year, 0, 1)), "New Year's Day"],
    [nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekday(year, 1, 1, 3), "Washington's Birthday"],
    [addDays(easterSunday(year), -2), 'Good Friday'],
    [lastWeekday(year, 4, 1), 'Memorial Day'],
    [observedDate(utcDate(year, 5, 19)), 'Juneteenth'],
    [observedDate(utcDate(year, 6, 4)), 'Independence Day'],
    [nthWeekday(year, 8, 1, 1), 'Labor Day'],
    [nthWeekday(year, 10, 4, 4), 'Thanksgiving Day'],
    [observedDate(utcDate(year, 11, 25)), 'Christmas Day'],
  ]

  return holidays.map(([date, name]) => ({ date: isoDate(date), name }))
}

export function getUsMarketHolidayName(date: string): string | null {
  const year = Number(date.slice(0, 4))
  if (!Number.isInteger(year)) return null
  const holidays = [
    ...holidaysForYear(year - 1),
    ...holidaysForYear(year),
    ...holidaysForYear(year + 1),
  ]
  return holidays.find((holiday) => holiday.date === date)?.name ?? null
}

export function isUsMarketTradingDay(date: string): boolean {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return false
  const weekday = parsed.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return getUsMarketHolidayName(date) == null
}

export const __testOnly = {
  easterSunday,
  holidaysForYear,
  observedDate,
}
