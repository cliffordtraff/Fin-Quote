import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  advance: vi.fn(),
  getClock: vi.fn(),
  getRun: vi.fn(),
  getWindow: vi.fn(),
  listScopes: vi.fn(),
  log: vi.fn(),
  notifyLate: vi.fn(),
}))

vi.mock('@/lib/newsletter/daily-automation', () => ({
  advanceNewsletterDailyAutomation: mocks.advance,
  getNewsletterAutomationClock: mocks.getClock,
  getNewsletterAutomationWindow: mocks.getWindow,
  getNewsletterDailyAutomationRun: mocks.getRun,
  notifyNewsletterMorningLate: mocks.notifyLate,
}))

vi.mock('@/lib/newsletter/daily-runs', () => ({
  listEnabledNewsletterDailyScopes: mocks.listScopes,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
}))

import { GET, maxDuration } from '@/app/api/cron/newsletter-daily/route'

const clock = {
  marketDate: '2026-08-05',
  weekday: 'Wed',
  hour: 7,
  minute: 30,
  isWeekday: true,
  isTradingDay: true,
  holidayName: null,
  isCollectionWindow: true,
  isMorningReportWindow: true,
}

const window = {
  readyByHour: 8,
  startHour: 5,
  shouldRun: true,
  isLate: false,
  hasEnded: false,
}

function request(authorized = true) {
  return new NextRequest('http://localhost/api/cron/newsletter-daily', {
    headers: authorized
      ? { authorization: 'Bearer test-cron-secret' }
      : undefined,
  })
}

describe('newsletter daily cron route', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    mocks.getClock.mockReturnValue(clock)
    mocks.getRun.mockResolvedValue(null)
    mocks.listScopes.mockResolvedValue([
      {
        scope: { ownerId: 'owner-1', sessionId: 'session-1' },
        settings: { generationHour: 8 },
      },
    ])
    mocks.getWindow.mockReturnValue(window)
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'summary-batch',
      run: {
        status: 'running',
        stage: 'summaries',
        invocationCount: 12,
        candidateCount: 147,
        summaryCompletedCount: 64,
        newsletterSelectedCount: 0,
        newsletterReadyCount: 0,
        newsletterAttentionCount: 0,
        newsletterFailedCount: 0,
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed before touching automation state', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(mocks.getRun).not.toHaveBeenCalled()
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'daily',
        event: 'request-rejected',
      }),
    )
  })

  it.each(['completed', 'partial', 'failed'])(
    'does not claim a terminal %s run',
    async (status) => {
      mocks.getRun.mockResolvedValue({
        id: 'run-1',
        status,
        stage: status === 'failed' ? 'failed' : 'completed',
        invocationCount: 42,
      })

      const response = await GET(request())
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        skipped: true,
        terminal: true,
        run: { status },
      })
      expect(mocks.listScopes).not.toHaveBeenCalled()
      expect(mocks.advance).not.toHaveBeenCalled()
      expect(mocks.log).toHaveBeenCalledWith(
        expect.objectContaining({
          job: 'daily',
          event: 'run-skipped',
          terminal: true,
          status,
        }),
      )
    },
  )

  it('advances an active run and logs searchable run metrics', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      skipped: false,
      action: 'summary-batch',
    })
    expect(mocks.advance).toHaveBeenCalledWith({ marketDate: '2026-08-05' })
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'daily',
        event: 'run-advanced',
        action: 'summary-batch',
        candidateCount: 147,
        summaryCompletedCount: 64,
      }),
    )
  })

  it('returns a bounded error response and records the precise exception', async () => {
    mocks.getRun.mockRejectedValue(new Error('database unavailable'))

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Newsletter daily automation failed',
    })
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'daily',
        event: 'run-error',
        level: 'error',
        error: 'database unavailable',
      }),
    )
  })

  it('keeps each cron invocation shorter than the polling interval', () => {
    expect(maxDuration).toBe(60)
  })
})
