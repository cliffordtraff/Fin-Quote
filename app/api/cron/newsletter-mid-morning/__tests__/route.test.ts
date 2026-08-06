import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  advance: vi.fn(),
  ensureTerminalNotification: vi.fn(),
  getClock: vi.fn(),
  getPendingTerminalNotification: vi.fn(),
  getRun: vi.fn(),
  getWindow: vi.fn(),
  heartbeat: vi.fn(),
  log: vi.fn(),
  markFailed: vi.fn(),
}))

vi.mock('@/lib/newsletter/daily-automation', () => ({
  getNewsletterAutomationClock: mocks.getClock,
}))

vi.mock('@/lib/newsletter/mid-morning-automation', () => ({
  advanceNewsletterMidMorningAutomation: mocks.advance,
  ensureNewsletterMidMorningTerminalNotification:
    mocks.ensureTerminalNotification,
  getMidMorningAutomationWindow: mocks.getWindow,
  getPendingNewsletterMidMorningTerminalNotification:
    mocks.getPendingTerminalNotification,
  getNewsletterMidMorningRun: mocks.getRun,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
}))

vi.mock('@/lib/newsletter/cron-observability', () => ({
  markNewsletterCronResponseFailed: mocks.markFailed,
  withNewsletterCronHeartbeat: mocks.heartbeat,
}))

import {
  GET,
  maxDuration,
} from '@/app/api/cron/newsletter-mid-morning/route'

const clock = {
  marketDate: '2026-08-05',
  weekday: 'Wed',
  hour: 10,
  minute: 30,
  isWeekday: true,
  isTradingDay: true,
  holidayName: null,
  isCollectionWindow: false,
  isMorningReportWindow: true,
}

const window = {
  startHour: 10,
  startMinute: 15,
  shouldRun: true,
  isLate: false,
  hasEnded: false,
}

function request(authorized = true) {
  return new NextRequest('http://localhost/api/cron/newsletter-mid-morning', {
    headers: authorized
      ? { authorization: 'Bearer test-cron-secret' }
      : undefined,
  })
}

describe('newsletter mid-morning cron route', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    mocks.getClock.mockReturnValue(clock)
    mocks.getWindow.mockReturnValue(window)
    mocks.heartbeat.mockImplementation(
      async (_job: string, operation: () => Promise<Response>) => operation(),
    )
    mocks.markFailed.mockImplementation((response: Response) => {
      response.headers.set('x-newsletter-cron-reported-failure', '1')
      return response
    })
    mocks.getRun.mockResolvedValue(null)
    mocks.getPendingTerminalNotification.mockResolvedValue(null)
    mocks.ensureTerminalNotification.mockImplementation(async (run) => run)
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'summary-batch',
      run: {
        status: 'running',
        stage: 'summaries',
        invocationCount: 8,
        candidateCount: 20,
        summaryCompletedCount: 3,
        summaryGeneratedCount: 3,
        summaryErrorCount: 0,
        meaningfulChange: null,
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed before reading run state', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(mocks.getRun).not.toHaveBeenCalled()
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.heartbeat).not.toHaveBeenCalled()
  })

  it.each(['completed', 'partial', 'failed'])(
    'does not claim a terminal %s run',
    async (status) => {
      mocks.getRun.mockResolvedValue({
        id: 'mid-run-1',
        status,
        stage: status === 'failed' ? 'failed' : 'completed',
        invocationCount: 19,
      })

      const response = await GET(request())

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        skipped: true,
        terminal: true,
        run: { status },
      })
      expect(mocks.advance).not.toHaveBeenCalled()
      expect(mocks.ensureTerminalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      )
      expect(mocks.markFailed).toHaveBeenCalledTimes(
        status === 'failed' ? 1 : 0,
      )
      expect(mocks.log).toHaveBeenCalledWith(
        expect.objectContaining({
          job: 'mid-morning',
          event: 'run-skipped',
          terminal: true,
          status,
        }),
      )
    },
  )

  it('keeps a completed run unhealthy until its notification is durable', async () => {
    mocks.getRun.mockResolvedValue({
      id: 'mid-run-1',
      status: 'completed',
      stage: 'completed',
      invocationCount: 19,
    })
    mocks.ensureTerminalNotification.mockRejectedValue(
      new Error('notification insert failed'),
    )

    const response = await GET(request())
    expect(await response.json()).toMatchObject({
      terminal: true,
      notificationPending: true,
    })
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('retries a prior-day terminal notification after the market-date rollover', async () => {
    const prior = {
      id: 'prior-mid-run',
      marketDate: '2026-08-04',
      status: 'partial',
      stage: 'completed',
      notificationAppliedAt: null,
    }
    mocks.getPendingTerminalNotification.mockResolvedValue(prior)

    await GET(request())

    expect(mocks.getPendingTerminalNotification).toHaveBeenCalledWith(
      '2026-08-05',
    )
    expect(mocks.ensureTerminalNotification).toHaveBeenCalledWith(prior)
    expect(mocks.advance).toHaveBeenCalledTimes(1)
  })

  it('retries a terminal notification after the generation window closes', async () => {
    mocks.getWindow.mockReturnValue({
      ...window,
      shouldRun: false,
      hasEnded: true,
    })
    mocks.getRun.mockResolvedValue({
      id: 'mid-run-1',
      status: 'partial',
      stage: 'completed',
      invocationCount: 19,
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      terminal: true,
      run: { status: 'partial' },
    })
    expect(mocks.ensureTerminalNotification).toHaveBeenCalledTimes(1)
    expect(mocks.advance).not.toHaveBeenCalled()
  })

  it('advances an active run and logs its operational counts', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      skipped: false,
      action: 'summary-batch',
    })
    expect(mocks.advance).toHaveBeenCalledWith({
      marketDate: '2026-08-05',
      stageBudgetMs: expect.any(Number),
    })
    expect(mocks.heartbeat).toHaveBeenCalledWith(
      'mid_morning',
      expect.any(Function),
    )
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'mid-morning',
        event: 'run-advanced',
        candidateCount: 20,
        summaryCompletedCount: 3,
      }),
    )
  })

  it('reports an exhausted invocation budget as failed observability', async () => {
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'invocation-budget-exhausted',
      run: {
        status: 'running',
        stage: 'summaries',
        invocationCount: 9,
        candidateCount: 20,
        summaryCompletedCount: 3,
        summaryGeneratedCount: 3,
        summaryErrorCount: 0,
        meaningfulChange: null,
      },
    })

    const response = await GET(request())
    expect(response.headers.get('x-newsletter-cron-reported-failure')).toBe('1')
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('caps a fresh stage to the absolute request deadline after preflight', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-06T12:00:00.000Z')
    vi.setSystemTime(startedAt)
    mocks.getRun.mockImplementation(async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 15_000))
      return null
    })

    await GET(request())

    expect(mocks.advance).toHaveBeenCalledWith({
      marketDate: '2026-08-05',
      stageBudgetMs: 35_000,
    })
  })

  it('declines a fresh lease when preflight consumed the safe stage budget', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-06T12:00:00.000Z')
    vi.setSystemTime(startedAt)
    mocks.getRun.mockImplementation(async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 39_000))
      return null
    })

    const response = await GET(request())

    expect(await response.json()).toMatchObject({
      skipped: true,
      action: 'request-budget-exhausted',
    })
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('returns a bounded error and logs the underlying failure', async () => {
    mocks.advance.mockRejectedValue(new Error('lease RPC failed'))

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Newsletter mid-morning automation failed',
    })
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'mid-morning',
        event: 'run-error',
        level: 'error',
        error: 'lease RPC failed',
      }),
    )
  })

  it('keeps each cron invocation shorter than the polling interval', () => {
    expect(maxDuration).toBe(60)
  })
})
