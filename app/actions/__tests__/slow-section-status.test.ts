import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMarketNews,
  getMarketNewsWithStatus,
} from '@/app/actions/get-market-news'
import {
  fetchEarningsCalendar,
  fetchEarningsCalendarWithStatus,
} from '@/app/actions/earnings-calendar'
import { getSectorPerformance } from '@/app/actions/sectors'
import { getEconomicEvents } from '@/app/actions/economic-calendar'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  process.env.FMP_API_KEY = 'test-key'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.FMP_API_KEY
})

describe('slow section status-preserving loaders', () => {
  it('exposes news transport failure while preserving the public empty fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)))

    await expect(getMarketNewsWithStatus()).resolves.toEqual({
      error: 'Failed to load market news',
    })
    await expect(getMarketNews()).resolves.toEqual([])
  })

  it('distinguishes legitimate empty news from transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await expect(getMarketNewsWithStatus()).resolves.toEqual({ news: [] })
  })

  it('exposes earnings transport failure while preserving the public empty fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)))

    await expect(fetchEarningsCalendarWithStatus()).resolves.toEqual({
      error: 'Failed to fetch earnings calendar',
    })
    await expect(fetchEarningsCalendar()).resolves.toEqual({
      earnings: [],
      totalCount: 0,
    })
  })

  it('distinguishes a legitimate empty earnings week from transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await expect(fetchEarningsCalendarWithStatus()).resolves.toEqual({
      earnings: [],
      totalCount: 0,
    })
  })

  it('rejects a malformed HTTP-200 earnings payload without changing the public fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'upstream' })))

    await expect(fetchEarningsCalendarWithStatus()).resolves.toEqual({
      error: 'Failed to fetch earnings calendar',
    })
    await expect(fetchEarningsCalendar()).resolves.toEqual({
      earnings: [],
      totalCount: 0,
    })
  })

  it('rejects malformed sector data while treating a real empty array as healthy', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'upstream' }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSectorPerformance()).resolves.toEqual({
      error: 'Failed to load sector performance data',
    })
    await expect(getSectorPerformance()).resolves.toEqual({ sectors: [] })
  })

  it('rejects malformed economic data while treating a real empty array as healthy', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'upstream' }))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getEconomicEvents()).resolves.toEqual({
      error: 'Failed to load economic calendar data',
    })
    await expect(getEconomicEvents()).resolves.toEqual({ events: [] })
  })
})
