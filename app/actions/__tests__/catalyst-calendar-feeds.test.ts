import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchEarningsCalendarForCatalystCalendar,
  fetchEarningsCalendarWithStatus,
} from '@/app/actions/earnings-calendar'
import {
  getEconomicEvents,
  getEconomicEventsForCatalystCalendar,
} from '@/app/actions/economic-calendar'
import { getSP500Constituent, SP500_SYMBOLS } from '@/lib/sp500'

const REFERENCE_TIME = '2026-08-05T16:00:00.000Z'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function earningsRow(symbol: string, index = 0) {
  return {
    symbol,
    date: `2026-08-${String(3 + (index % 5)).padStart(2, '0')}`,
    time: (['bmo', 'dmh', 'amc'] as const)[index % 3],
    fiscalDateEnding: '2026-06-30',
    eps: null,
    epsEstimated: 1.25,
    revenue: null,
    revenueEstimated: 10_000_000,
  }
}

function economicRow(index: number) {
  const day = 3 + (index % 7)
  const hour = 8 + (Math.floor(index / 7) % 10)
  return {
    date: `2026-08-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:30:00`,
    country: 'US',
    event: `Economic release ${index}`,
    currency: 'USD',
    previous: index,
    estimate: index + 1,
    actual: null,
    impact: index % 2 === 0 ? 'High' : 'Medium',
    unit: '%',
  }
}

beforeEach(() => {
  process.env.FMP_API_KEY = 'test-key'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-05T16:00:00Z'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.FMP_API_KEY
})

describe('full catalyst earnings feed', () => {
  it('uses canonical S&P metadata, normalizes aliases, and keeps the page bounded at 100', async () => {
    const symbols = Array.from(SP500_SYMBOLS).filter((symbol) => symbol !== 'BRK.B').slice(0, 105)
    const rows = symbols.map(earningsRow)
    rows[0] = earningsRow('BRK-B')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(rows)))
    vi.stubGlobal('fetch', fetchMock)

    const calendar = await fetchEarningsCalendarForCatalystCalendar(REFERENCE_TIME)
    const dashboard = await fetchEarningsCalendarWithStatus()

    expect('earnings' in calendar).toBe(true)
    expect('earnings' in dashboard).toBe(true)
    if (!('earnings' in calendar) || !('earnings' in dashboard)) {
      throw new Error('Expected healthy earnings results')
    }
    expect(calendar.earnings).toHaveLength(100)
    expect(calendar.totalCount).toBe(105)
    expect(calendar.truncated).toBe(true)
    expect(dashboard.earnings).toHaveLength(10)
    expect(calendar.earnings[0]?.name)
      .toBe(getSP500Constituent(calendar.earnings[0]?.symbol ?? '')?.name)
    expect(calendar.earnings.some((item) => item.symbol === 'BRK.B')).toBe(true)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('from=2026-08-03&to=2026-08-09')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('from=2026-08-03&to=2026-08-07')
  })

  it('rejects malformed eligible rows instead of presenting a false empty week', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      { ...earningsRow('AAPL'), eps: 'not-a-number' },
    ])))

    await expect(fetchEarningsCalendarForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      error: 'Failed to fetch earnings calendar',
    })
  })

  it('treats a valid non-S&P response as an authoritative empty feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
      { symbol: 'NOTSP' },
    ])))

    await expect(fetchEarningsCalendarForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      earnings: [],
      totalCount: 0,
      truncated: false,
    })
  })

  it('fails closed before buffering a provider body declared above the byte cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    })))

    await expect(fetchEarningsCalendarForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      error: 'Failed to fetch earnings calendar',
    })
  })
})

describe('full catalyst economic feed', () => {
  it('returns a chronological 100-event page feed while preserving the dashboard limit of 12', async () => {
    const rows = Array.from({ length: 105 }, (_, index) => economicRow(index))
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(rows)))
    vi.stubGlobal('fetch', fetchMock)

    const calendar = await getEconomicEventsForCatalystCalendar(REFERENCE_TIME)
    const dashboard = await getEconomicEvents()

    expect('events' in calendar && calendar.events).toHaveLength(100)
    expect('events' in calendar && calendar.totalCount).toBe(105)
    expect('events' in calendar && calendar.truncated).toBe(true)
    expect('events' in dashboard && dashboard.events).toHaveLength(12)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('from=2026-08-03&to=2026-08-09')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('from=2026-08-05&to=2026-08-12')
  })

  it('rejects malformed qualifying rows and distinguishes them from legitimate empty data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ ...economicRow(0), currency: 12 }]))
      .mockResolvedValueOnce(jsonResponse([{ country: 'US', impact: 'Low', event: 'Minor release' }]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getEconomicEventsForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      error: 'Failed to load economic calendar data',
    })
    await expect(getEconomicEventsForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      events: [],
      totalCount: 0,
      truncated: false,
    })
  })

  it('rejects structurally malformed provider arrays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{}])))

    await expect(getEconomicEventsForCatalystCalendar(REFERENCE_TIME)).resolves.toEqual({
      error: 'Failed to load economic calendar data',
    })
  })

  it('rejects stale range references before making a provider request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getEconomicEventsForCatalystCalendar('2026-07-01T12:00:00.000Z')).resolves.toEqual({
      error: 'Failed to load economic calendar data',
    })
    await expect(fetchEarningsCalendarForCatalystCalendar('2026-07-01T12:00:00.000Z')).resolves.toEqual({
      error: 'Failed to fetch earnings calendar',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
