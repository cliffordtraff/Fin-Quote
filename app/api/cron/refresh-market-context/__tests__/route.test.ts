import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClock: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/newsletter/automation-clock', () => ({
  getNewsletterAutomationClock: mocks.getClock,
}))

vi.mock('@/lib/refresh-dashboard-commentary', () => ({
  refreshDashboardCommentary: mocks.refresh,
}))

import { GET, maxDuration } from '@/app/api/cron/refresh-market-context/route'

const tradingClock = {
  now: '2026-08-03T14:15:00.000Z',
  marketDate: '2026-08-03',
  hour: 10,
  minute: 15,
  isTradingDay: true,
  holidayName: null,
}

function request(options?: { authorized?: boolean; force?: boolean }) {
  const query = options?.force ? '?force=1' : ''
  return new NextRequest(`http://localhost/api/cron/refresh-market-context${query}`, {
    headers: options?.authorized
      ? { authorization: 'Bearer test-cron-secret' }
      : undefined,
  })
}

describe('refresh market context cron route', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    mocks.getClock.mockReturnValue(tradingClock)
    mocks.refresh.mockResolvedValue({
      marketDate: tradingClock.marketDate,
      attempted: ['marketSummary', 'marketTrends', 'calendar'],
      skippedComponents: [],
      complete: true,
      marketSummary: {
        ready: true,
        available: true,
        refreshed: true,
        error: null,
      },
      marketTrends: {
        ready: true,
        bulletCount: 6,
        refreshed: true,
        error: null,
      },
      calendar: {
        ready: true,
        economicAvailable: true,
        earningsAvailable: true,
        refreshed: true,
        error: null,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed when the scheduler is not authorized', async () => {
    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips outside the narrow Eastern refresh window', async () => {
    mocks.getClock.mockReturnValue({ ...tradingClock, hour: 9, minute: 15 })

    const response = await GET(request({ authorized: true }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skipped: true })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('refreshes all dashboard commentary inside the trusted window', async () => {
    const response = await GET(request({ authorized: true }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      skipped: false,
      marketSummary: { available: true },
      marketTrends: { bulletCount: 6 },
    })
    expect(mocks.refresh).toHaveBeenCalledWith({
      marketDate: tradingClock.marketDate,
    })
  })

  it('reports an idempotent full skip when the market-date caches are complete', async () => {
    mocks.refresh.mockResolvedValue({
      marketDate: tradingClock.marketDate,
      attempted: [],
      skippedComponents: ['marketSummary', 'marketTrends', 'calendar'],
      complete: true,
      marketSummary: {
        ready: true,
        available: true,
        refreshed: false,
        error: null,
      },
      marketTrends: {
        ready: true,
        bulletCount: 6,
        refreshed: false,
        error: null,
      },
      calendar: {
        ready: true,
        economicAvailable: true,
        earningsAvailable: true,
        refreshed: false,
        error: null,
      },
    })

    const response = await GET(request({ authorized: true }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      skipped: true,
      reason: `Dashboard commentary is already complete for ${tradingClock.marketDate}`,
      attempted: [],
      complete: true,
    })
  })

  it('returns 503 when any durable commentary component remains incomplete', async () => {
    mocks.refresh.mockResolvedValue({
      marketDate: tradingClock.marketDate,
      attempted: ['marketTrends'],
      skippedComponents: ['marketSummary', 'calendar'],
      complete: false,
      marketSummary: {
        ready: true,
        available: true,
        refreshed: false,
        error: null,
      },
      marketTrends: {
        ready: false,
        bulletCount: 3,
        refreshed: false,
        error: 'No complete market-trends cache row was persisted',
      },
      calendar: {
        ready: true,
        economicAvailable: true,
        earningsAvailable: true,
        refreshed: false,
        error: null,
      },
    })

    const response = await GET(request({ authorized: true }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      complete: false,
      marketTrends: { ready: false },
    })
  })

  it('allows a bounded route duration shorter than the retry interval', () => {
    expect(maxDuration).toBe(240)
  })
})
