import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClock: vi.fn(),
  getReadiness: vi.fn(),
}))

vi.mock('@/lib/newsletter/automation-clock', () => ({
  getNewsletterAutomationClock: mocks.getClock,
}))

vi.mock('@/lib/refresh-dashboard-commentary', () => ({
  getDashboardCommentaryReadiness: mocks.getReadiness,
}))

import { GET } from '@/app/api/health/dashboard-commentary/route'

const dueClock = {
  marketDate: '2026-08-10',
  isTradingDay: true,
  hour: 10,
  minute: 35,
}

describe('dashboard commentary health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClock.mockReturnValue(dueClock)
    mocks.getReadiness.mockResolvedValue({
      marketSummary: { ready: true, available: true },
      marketTrends: { ready: true, bulletCount: 6 },
      calendar: {
        ready: true,
        economicAvailable: true,
        earningsAvailable: true,
      },
    })
  })

  it('does not alert before the final scheduled recovery attempt is due', async () => {
    mocks.getClock.mockReturnValue({ ...dueClock, minute: 34 })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.getReadiness).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      status: 'healthy',
      state: 'not_due',
    })
  })

  it('returns 200 when every current-market-date component is durable', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toMatchObject({
      status: 'healthy',
      state: 'current',
      components: {
        marketSummary: true,
        marketTrends: true,
        calendar: true,
      },
    })
  })

  it('returns 503 with component-level state when a cache is incomplete', async () => {
    mocks.getReadiness.mockResolvedValue({
      marketSummary: { ready: true, available: true },
      marketTrends: { ready: false, bulletCount: 3 },
      calendar: {
        ready: true,
        economicAvailable: true,
        earningsAvailable: true,
      },
    })

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      status: 'unhealthy',
      state: 'incomplete',
      components: { marketTrends: false },
    })
  })

  it('sanitizes readiness backend failures', async () => {
    mocks.getReadiness.mockRejectedValue(
      new Error('postgres password=do-not-return'),
    )

    const response = await GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(body).toContain('observability_unavailable')
    expect(body).not.toContain('do-not-return')
  })

  it('treats weekends as not due even after the clock threshold', async () => {
    mocks.getClock.mockReturnValue({
      ...dueClock,
      isTradingDay: false,
      hour: 14,
      minute: 0,
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.getReadiness).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ state: 'not_due' })
  })
})
