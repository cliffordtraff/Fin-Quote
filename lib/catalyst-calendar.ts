/**
 * Browser-safe calendar primitives shared by the calendar Server Component,
 * its interactive filter, and the compact dashboard catalyst timeline.
 *
 * Keep this module free of provider clients and the S&P constituent JSON: it is
 * intentionally safe to include in a client bundle.
 */

export const CATALYST_TIME_ZONE = 'America/New_York'
export const CATALYST_CALENDAR_EARNINGS_LIMIT = 100
export const CATALYST_CALENDAR_ECONOMIC_LIMIT = 100

export type CatalystFeedStatus = 'ready' | 'empty' | 'unavailable'
export type CatalystItemType = 'economic' | 'earnings'
export type CatalystTypeFilter = 'all' | CatalystItemType
export type EarningsSession = 'bmo' | 'amc' | 'dmh' | null

export interface CatalystEarningsInput {
  symbol: string
  name: string
  date: string
  time: EarningsSession
  eps: number | null
  epsEstimated: number | null
  revenue: number | null
  revenueEstimated: number | null
}

export interface CatalystEconomicInput {
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

export interface CatalystCalendarItem {
  id: string
  type: CatalystItemType
  dateKey: string
  timestamp: number
  title: string
  detail: string | null
  impact: 'high' | 'medium' | 'normal'
  symbol: string | null
  href: string | null
  timing: EarningsSession
}

export interface CatalystCalendarDay {
  dateKey: string
  label: string
  shortLabel: string
  count: number
}

export interface CatalystFeedMeta {
  status: CatalystFeedStatus
  totalCount: number
  truncated: boolean
}

export interface CatalystCalendarModel {
  referenceTime: string
  fromDate: string
  toDate: string
  rangeLabel: string
  initialDay: string | null
  days: CatalystCalendarDay[]
  items: CatalystCalendarItem[]
  feeds: {
    economic: CatalystFeedMeta
    earnings: CatalystFeedMeta
  }
}

export interface CatalystWeek {
  fromDate: string
  toDate: string
  businessToDate: string
  dateKeys: string[]
}

const CURRENT_REFERENCE_TOLERANCE_MS = 5 * 60 * 1000

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const NAIVE_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/
const EXPLICIT_ZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i

const newYorkDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CATALYST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const newYorkDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CATALYST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dayHeadingFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

const dayButtonFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'numeric',
  day: 'numeric',
})

const rangeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
})

function dateTimeParts(timestamp: number): Record<string, number> | null {
  if (!Number.isFinite(timestamp)) return null

  const parts: Record<string, number> = {}
  for (const part of newYorkDateTimeFormatter.formatToParts(new Date(timestamp))) {
    if (part.type === 'literal') continue
    const value = Number(part.value)
    if (Number.isFinite(value)) parts[part.type] = value
  }

  return parts.year && parts.month && parts.day
    ? parts
    : null
}

function dateKeyParts(dateKey: string): [number, number, number] | null {
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return [year, month, day]
}

export function isDateKey(value: string): boolean {
  return dateKeyParts(value) !== null
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const parts = dateKeyParts(dateKey)
  if (!parts || !Number.isInteger(days)) {
    throw new Error('Invalid calendar date')
  }

  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days))
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function newYorkDateKey(value: string | number | Date): string | null {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : Date.parse(value)

  if (!Number.isFinite(timestamp)) return null

  const values: Record<string, string> = {}
  for (const part of newYorkDateFormatter.formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') values[part.type] = part.value
  }

  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null
}

export function getCatalystWeek(reference: string | number | Date = Date.now()): CatalystWeek {
  const referenceDate = newYorkDateKey(reference)
  if (!referenceDate) throw new Error('Invalid calendar reference time')

  const parts = dateKeyParts(referenceDate)
  if (!parts) throw new Error('Invalid calendar reference date')

  const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()
  const daysToMonday = weekday === 0 ? 1 : weekday === 6 ? 2 : 1 - weekday
  const fromDate = addDaysToDateKey(referenceDate, daysToMonday)
  const dateKeys = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(fromDate, index))

  return {
    fromDate,
    businessToDate: dateKeys[4],
    toDate: dateKeys[6],
    dateKeys,
  }
}

/**
 * Validate an externally supplied render reference before it can select a paid
 * provider range. This pins concurrent feeds to one week without allowing a
 * public Server Action caller to fan out arbitrary historical cache keys.
 */
export function getCurrentCatalystWeek(
  referenceTime: string,
  now = Date.now(),
): CatalystWeek | null {
  if (typeof referenceTime !== 'string' || referenceTime.length > 40) return null
  const timestamp = Date.parse(referenceTime)
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > CURRENT_REFERENCE_TOLERANCE_MS) {
    return null
  }

  try {
    return getCatalystWeek(timestamp)
  } catch {
    return null
  }
}

function timeZoneOffsetAt(timestamp: number): number | null {
  const parts = dateTimeParts(timestamp)
  if (!parts) return null

  const renderedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )
  return renderedAsUtc - Math.floor(timestamp / 1000) * 1000
}

/** Convert a New York wall-clock value to an epoch without assuming EDT/EST. */
export function newYorkWallTimeToTimestamp(
  dateKey: string,
  hour: number,
  minute = 0,
  second = 0,
): number {
  const parts = dateKeyParts(dateKey)
  if (
    !parts ||
    !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !Number.isInteger(minute) || minute < 0 || minute > 59 ||
    !Number.isInteger(second) || second < 0 || second > 59
  ) {
    return Number.NaN
  }

  const wallClockAsUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], hour, minute, second)
  let candidate = wallClockAsUtc

  // Two passes cover offset changes between the UTC guess and New York wall time.
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = timeZoneOffsetAt(candidate)
    if (offset === null) return Number.NaN
    candidate = wallClockAsUtc - offset
  }

  const rendered = dateTimeParts(candidate)
  if (
    !rendered ||
    rendered.year !== parts[0] ||
    rendered.month !== parts[1] ||
    rendered.day !== parts[2] ||
    rendered.hour !== hour ||
    rendered.minute !== minute ||
    rendered.second !== second
  ) {
    return Number.NaN
  }

  return candidate
}

/** Parse an FMP timestamp, treating offset-free values as New York wall time. */
export function parseNewYorkTimestamp(value: string): number {
  const normalized = value.trim()
  if (EXPLICIT_ZONE_PATTERN.test(normalized)) {
    return Date.parse(normalized)
  }

  const dateOnly = dateKeyParts(normalized)
  if (dateOnly) return newYorkWallTimeToTimestamp(normalized, 12)

  const match = NAIVE_DATE_TIME_PATTERN.exec(normalized)
  if (!match) return Number.NaN

  const dateKey = `${match[1]}-${match[2]}-${match[3]}`
  return newYorkWallTimeToTimestamp(
    dateKey,
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
  )
}

export function earningsTimestamp(dateKey: string, time: EarningsSession): number {
  const hour = time === 'bmo' ? 8 : time === 'dmh' ? 12 : time === 'amc' ? 16 : 20
  return newYorkWallTimeToTimestamp(dateKey, hour)
}

export function earningsTimeLabel(time: EarningsSession): string {
  if (time === 'bmo') return 'Before market open'
  if (time === 'amc') return 'After market close'
  if (time === 'dmh') return 'During market hours'
  return 'Time to be announced'
}

function economicDetail(event: CatalystEconomicInput): string | null {
  const unit = event.unit.trim()
  const parts = [
    event.previous !== null ? `Prev ${event.previous}${unit}` : null,
    event.estimate !== null ? `Est ${event.estimate}${unit}` : null,
    event.actual !== null ? `Actual ${event.actual}${unit}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function catalystStableId(
  type: 'economic' | 'earnings' | 'headline',
  parts: readonly string[],
): string {
  return `${type}-${stableHash(parts.join('|'))}`
}

function dateKeyLabel(dateKey: string, formatter: Intl.DateTimeFormat): string {
  const parts = dateKeyParts(dateKey)
  if (!parts) return dateKey
  return formatter.format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)))
}

function itemSort(left: CatalystCalendarItem, right: CatalystCalendarItem): number {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp
  if (left.type !== right.type) return left.type === 'economic' ? -1 : 1
  const titleOrder = left.title.localeCompare(right.title, 'en-US')
  return titleOrder !== 0 ? titleOrder : left.id.localeCompare(right.id, 'en-US')
}

export function buildCatalystCalendarModel({
  earnings,
  economicEvents,
  feeds,
  referenceTime,
}: {
  earnings: CatalystEarningsInput[]
  economicEvents: CatalystEconomicInput[]
  feeds: CatalystCalendarModel['feeds']
  referenceTime: string
}): CatalystCalendarModel {
  const week = getCatalystWeek(referenceTime)
  const dateSet = new Set(week.dateKeys)
  const seenIds = new Set<string>()
  const items: CatalystCalendarItem[] = []

  for (const event of economicEvents) {
    const timestamp = parseNewYorkTimestamp(event.date)
    const dateKey = newYorkDateKey(timestamp)
    if (!dateKey || !dateSet.has(dateKey) || !Number.isFinite(timestamp)) continue

    const id = catalystStableId('economic', [
      dateKey,
      event.date,
      event.event,
      event.country,
      event.currency,
    ])
    if (seenIds.has(id)) continue
    seenIds.add(id)

    items.push({
      id,
      type: 'economic',
      dateKey,
      timestamp,
      title: event.event,
      detail: economicDetail(event),
      impact: event.impact.toLowerCase() === 'high' ? 'high' : 'medium',
      symbol: null,
      href: null,
      timing: null,
    })
  }

  for (const earning of earnings) {
    if (!dateSet.has(earning.date)) continue
    const timestamp = earningsTimestamp(earning.date, earning.time)
    if (!Number.isFinite(timestamp)) continue

    const id = catalystStableId('earnings', [earning.date, earning.symbol])
    if (seenIds.has(id)) continue
    seenIds.add(id)

    items.push({
      id,
      type: 'earnings',
      dateKey: earning.date,
      timestamp,
      title: `${earning.symbol} · ${earning.name}`,
      detail: earningsTimeLabel(earning.time),
      impact: 'normal',
      symbol: earning.symbol,
      href: `/stock/${encodeURIComponent(earning.symbol)}`,
      timing: earning.time,
    })
  }

  items.sort(itemSort)

  const referenceTimestamp = Date.parse(referenceTime)
  const firstUpcoming = items.find((item) => item.timestamp >= referenceTimestamp)
  const firstUsefulDay = firstUpcoming?.dateKey ?? items[0]?.dateKey ?? null
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.dateKey, (counts.get(item.dateKey) ?? 0) + 1)

  const days = week.dateKeys.map((dateKey) => ({
    dateKey,
    label: dateKeyLabel(dateKey, dayHeadingFormatter),
    shortLabel: dateKeyLabel(dateKey, dayButtonFormatter),
    count: counts.get(dateKey) ?? 0,
  }))

  const fromLabel = dateKeyLabel(week.fromDate, rangeFormatter)
  const toLabel = dateKeyLabel(week.toDate, rangeFormatter)

  return {
    referenceTime,
    fromDate: week.fromDate,
    toDate: week.toDate,
    rangeLabel: `${fromLabel} – ${toLabel}`,
    initialDay: firstUsefulDay,
    days,
    items,
    feeds,
  }
}
