'use server'

import {
  addDaysToDateKey,
  CATALYST_CALENDAR_ECONOMIC_LIMIT,
  getCatalystWeek,
  getCurrentCatalystWeek,
  newYorkDateKey,
  parseNewYorkTimestamp,
} from '@/lib/catalyst-calendar'
import { readBoundedProviderJson } from '@/lib/catalyst-provider-response'
import { safeErrorMessage } from '@/lib/safe-logging'

export interface EconomicEvent {
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

export interface EconomicCalendarResult {
  events: EconomicEvent[]
}

export type EconomicCalendarLoadResult =
  | EconomicCalendarResult
  | { error: string }

export interface CatalystEconomicCalendarResult extends EconomicCalendarResult {
  totalCount: number
  truncated: boolean
}

export type CatalystEconomicCalendarLoadResult =
  | CatalystEconomicCalendarResult
  | { error: string }

type InternalEconomicCalendarLoadResult =
  | { events: EconomicEvent[]; totalCount: number }
  | { error: string }

const DASHBOARD_ECONOMIC_LIMIT = 12
const MAX_PROVIDER_ROWS = 5_000
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 6_000
const MAX_EVENT_LENGTH = 240
const MAX_DATE_LENGTH = 40

type LoadMode = 'dashboard' | 'calendar'
type ProviderRow = Record<string, unknown>

function isRecord(value: unknown): value is ProviderRow {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function boundedString(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxLength) return null
  return normalized
}

function parseEligibleRow(row: ProviderRow): EconomicEvent | null {
  const date = boundedString(row.date, MAX_DATE_LENGTH)
  const event = boundedString(row.event, MAX_EVENT_LENGTH)
  const currency = boundedString(row.currency, 12, true)
  const unit = row.unit === null || row.unit === undefined
    ? ''
    : boundedString(row.unit, 24, true)
  const previous = nullableFiniteNumber(row.previous)
  const estimate = nullableFiniteNumber(row.estimate)
  const actual = nullableFiniteNumber(row.actual)
  const impactValue = typeof row.impact === 'string' ? row.impact.trim().toLowerCase() : ''
  const impact = impactValue === 'high'
    ? 'High' as const
    : impactValue === 'medium'
      ? 'Medium' as const
      : null

  if (
    date === null ||
    !Number.isFinite(parseNewYorkTimestamp(date)) ||
    event === null ||
    currency === null ||
    unit === null ||
    previous === undefined ||
    estimate === undefined ||
    actual === undefined ||
    impact === null
  ) {
    return null
  }

  return {
    date,
    country: 'US',
    event,
    currency: currency.toUpperCase(),
    previous,
    estimate,
    actual,
    impact,
    unit,
  }
}

function chronologicalSort(left: EconomicEvent, right: EconomicEvent): number {
  const timeOrder = parseNewYorkTimestamp(left.date) - parseNewYorkTimestamp(right.date)
  return timeOrder !== 0
    ? timeOrder
    : left.event.localeCompare(right.event, 'en-US')
}

function parseProviderRows(value: unknown): EconomicEvent[] | null {
  if (!Array.isArray(value) || value.length > MAX_PROVIDER_ROWS) return null

  const parsed: EconomicEvent[] = []
  const seen = new Set<string>()

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.country !== 'string' ||
      typeof candidate.impact !== 'string' ||
      typeof candidate.event !== 'string'
    ) {
      return null
    }

    const country = candidate.country.trim().toUpperCase()
    const impact = candidate.impact.trim().toLowerCase()
    if (country !== 'US' || (impact !== 'high' && impact !== 'medium')) continue

    const event = parseEligibleRow(candidate)
    if (!event) return null

    const key = `${event.date}|${event.event}|${event.currency}`
    if (seen.has(key)) continue
    seen.add(key)
    parsed.push(event)
  }

  return parsed
}

function selectDashboardEvents(events: EconomicEvent[]): EconomicEvent[] {
  const high: EconomicEvent[] = []
  const medium: EconomicEvent[] = []

  for (const event of events) {
    if (event.impact === 'High') high.push(event)
    else medium.push(event)
  }

  high.sort(chronologicalSort)
  medium.sort(chronologicalSort)
  const selectedHigh = high.slice(0, DASHBOARD_ECONOMIC_LIMIT)

  return [
    ...selectedHigh,
    ...medium.slice(0, DASHBOARD_ECONOMIC_LIMIT - selectedHigh.length),
  ].sort(chronologicalSort)
}

async function loadEconomicEvents(
  mode: LoadMode,
  referenceTime?: string,
): Promise<InternalEconomicCalendarLoadResult> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return { error: 'API configuration error' }

  try {
    const today = newYorkDateKey(Date.now())
    if (!today) return { error: 'Failed to load economic calendar data' }

    const week = mode === 'calendar'
      ? getCurrentCatalystWeek(referenceTime ?? '')
      : getCatalystWeek()
    if (!week) return { error: 'Failed to load economic calendar data' }
    const from = mode === 'calendar' ? week.fromDate : today
    const to = mode === 'calendar' ? week.toDate : addDaysToDateKey(today, 7)
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`,
      {
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    )

    if (!response.ok) throw new Error(`Economic calendar request failed (${response.status})`)

    const providerEvents = parseProviderRows(
      await readBoundedProviderJson(response, MAX_PROVIDER_RESPONSE_BYTES),
    )
    if (!providerEvents) throw new Error('Invalid economic calendar payload')

    const events = providerEvents.filter((event) => {
      const dateKey = newYorkDateKey(parseNewYorkTimestamp(event.date))
      return dateKey !== null && dateKey >= from && dateKey <= to
    })

    const selected = mode === 'calendar'
      ? events.sort(chronologicalSort).slice(0, CATALYST_CALENDAR_ECONOMIC_LIMIT)
      : selectDashboardEvents(events)

    return { events: selected, totalCount: events.length }
  } catch (error) {
    console.error('Error fetching economic calendar:', safeErrorMessage(error))
    return { error: 'Failed to load economic calendar data' }
  }
}

/** Compact, impact-prioritized feed used by the dashboard and briefs. */
export async function getEconomicEvents(): Promise<EconomicCalendarLoadResult> {
  const result = await loadEconomicEvents('dashboard')
  return 'error' in result ? result : { events: result.events }
}

/** Chronological, bounded week feed used only by the full Catalyst Calendar. */
export async function getEconomicEventsForCatalystCalendar(
  referenceTime: string,
): Promise<CatalystEconomicCalendarLoadResult> {
  const result = await loadEconomicEvents('calendar', referenceTime)
  if ('error' in result) return result
  return {
    ...result,
    truncated: result.totalCount > CATALYST_CALENDAR_ECONOMIC_LIMIT,
  }
}
