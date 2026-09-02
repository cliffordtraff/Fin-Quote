import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  advance: vi.fn(),
  ensureTerminalNotification: vi.fn(),
  getClock: vi.fn(),
  getPendingTerminalNotification: vi.fn(),
  getRun: vi.fn(),
  getTerminalReconciliation: vi.fn(),
  getWindow: vi.fn(),
  heartbeat: vi.fn(),
  listScopes: vi.fn(),
  log: vi.fn(),
  markFailed: vi.fn(),
  notifyLate: vi.fn(),
}))

vi.mock('@/lib/newsletter/daily-automation', () => ({
  advanceNewsletterDailyAutomation: mocks.advance,
  ensureNewsletterDailyTerminalNotification: mocks.ensureTerminalNotification,
  getNewsletterAutomationClock: mocks.getClock,
  getPendingNewsletterDailyTerminalNotification:
    mocks.getPendingTerminalNotification,
  getNewsletterAutomationWindow: mocks.getWindow,
  getNewsletterDailyAutomationRun: mocks.getRun,
  getNewsletterDailyTerminalReconciliation: mocks.getTerminalReconciliation,
  notifyNewsletterMorningLate: mocks.notifyLate,
}))

vi.mock('@/lib/newsletter/daily-runs', () => ({
  listEnabledNewsletterDailyScopes: mocks.listScopes,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
}))

vi.mock('@/lib/newsletter/cron-observability', () => ({
  markNewsletterCronResponseFailed: mocks.markFailed,
  withNewsletterCronHeartbeat: mocks.heartbeat,
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
  startHour: 3,
  startMinute: 15,
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
    mocks.getTerminalReconciliation.mockResolvedValue({ hasDrift: false })
    mocks.getPendingTerminalNotification.mockResolvedValue(null)
    mocks.ensureTerminalNotification.mockImplementation(async (run) => run)
    mocks.listScopes.mockResolvedValue([
      {
        scope: { ownerId: 'owner-1', sessionId: 'session-1' },
        settings: { generationHour: 8 },
      },
    ])
    mocks.getWindow.mockReturnValue(window)
    mocks.heartbeat.mockImplementation(
      async (_job: string, operation: () => Promise<Response>) => operation(),
    )
    mocks.markFailed.mockImplementation((response: Response) => {
      response.headers.set('x-newsletter-cron-reported-failure', '1')
      return response
    })
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
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed before touching automation state', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(mocks.getRun).not.toHaveBeenCalled()
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.heartbeat).not.toHaveBeenCalled()
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
      expect(mocks.ensureTerminalNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      )
      expect(mocks.markFailed).toHaveBeenCalledTimes(
        status === 'failed' ? 1 : 0,
      )
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

  it('keeps a completed run externally unhealthy until its notification is durable', async () => {
    mocks.getRun.mockResolvedValue({
      id: 'run-1',
      status: 'completed',
      stage: 'completed',
      invocationCount: 42,
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

  it('reconciles a repaired terminal partial run and re-applies completion notification state', async () => {
    const partial = {
      id: 'run-1',
      marketDate: '2026-08-05',
      status: 'partial',
      stage: 'completed',
      invocationCount: 42,
      candidateCount: 147,
      summaryCompletedCount: 147,
      newsletterScopeCount: 1,
      newsletterCompletedScopeCount: 0,
      newsletterSelectedCount: 40,
      newsletterGeneratedCount: 40,
      newsletterReadyCount: 39,
      newsletterAttentionCount: 1,
      newsletterFailedCount: 0,
      notificationAppliedAt: '2026-08-05T12:00:00.000Z',
    }
    mocks.getRun.mockResolvedValue(partial)
    mocks.getTerminalReconciliation.mockResolvedValue({ hasDrift: true })
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'terminal-reconciled',
      run: {
        ...partial,
        status: 'completed',
        newsletterCompletedScopeCount: 1,
        newsletterReadyCount: 40,
        newsletterAttentionCount: 0,
        notificationAppliedAt: '2026-08-05T12:05:00.000Z',
      },
    })

    const response = await GET(request())

    expect(await response.json()).toMatchObject({
      skipped: false,
      reconciled: true,
      action: 'terminal-reconciled',
      run: {
        status: 'completed',
        newsletterReadyCount: 40,
        notificationAppliedAt: '2026-08-05T12:05:00.000Z',
      },
    })
    expect(mocks.advance).toHaveBeenCalledWith({
      marketDate: '2026-08-05',
      retryCompleted: true,
      stageBudgetMs: expect.any(Number),
    })
    expect(mocks.ensureTerminalNotification).not.toHaveBeenCalledWith(partial)
  })

  it('does not claim a terminal run when its durable child state has no drift', async () => {
    const completed = {
      id: 'run-1',
      status: 'completed',
      stage: 'completed',
      invocationCount: 42,
    }
    mocks.getRun.mockResolvedValue(completed)
    mocks.getTerminalReconciliation.mockResolvedValue({ hasDrift: false })

    await GET(request())

    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.ensureTerminalNotification).toHaveBeenCalledWith(completed)
  })

  it('fails closed when a terminal run references a missing mapped child run', async () => {
    mocks.getRun.mockResolvedValue({
      id: 'run-1',
      status: 'completed',
      stage: 'completed',
      invocationCount: 42,
    })
    mocks.getTerminalReconciliation.mockRejectedValue(
      new Error('Terminal newsletter reconciliation is missing mapped child runs: child-1'),
    )

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(mocks.advance).not.toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'daily',
        event: 'run-error',
        error: expect.stringContaining('missing mapped child runs'),
      }),
    )
  })

  it('retries a prior-day terminal notification after the market-date rollover', async () => {
    const prior = {
      id: 'prior-run',
      marketDate: '2026-08-04',
      status: 'completed',
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

  it('advances an active run and logs searchable run metrics', async () => {
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
      'daily',
      expect.any(Function),
    )
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

  it('reports a terminal notification retry as failed observability', async () => {
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'notification-pending',
      run: {
        status: 'completed',
        stage: 'completed',
        invocationCount: 12,
        candidateCount: 147,
        summaryCompletedCount: 147,
        newsletterSelectedCount: 40,
        newsletterReadyCount: 40,
        newsletterAttentionCount: 0,
        newsletterFailedCount: 0,
      },
    })

    await GET(request())
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('reports an exhausted invocation budget as failed observability', async () => {
    mocks.advance.mockResolvedValue({
      claimed: true,
      action: 'invocation-budget-exhausted',
      run: {
        status: 'running',
        stage: 'summaries',
        invocationCount: 13,
        candidateCount: 147,
        summaryCompletedCount: 64,
        newsletterSelectedCount: 0,
        newsletterReadyCount: 0,
        newsletterAttentionCount: 0,
        newsletterFailedCount: 0,
      },
    })

    const response = await GET(request())
    expect(response.headers.get('x-newsletter-cron-reported-failure')).toBe('1')
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
  })

  it('caps a fresh non-Finviz stage to the standard stage budget', async () => {
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
      stageBudgetMs: 42_000,
    })
  })

  it('allows the Finviz conveyor to use its extended stage budget', async () => {
    mocks.getRun.mockResolvedValue({
      status: 'running',
      stage: 'finviz',
    })

    await GET(request())

    expect(mocks.advance).toHaveBeenCalledWith({
      marketDate: '2026-08-05',
      stageBudgetMs: 100_000,
    })
  })

  it('declines a fresh lease when preflight consumed the safe stage budget', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-06T12:00:00.000Z')
    vi.setSystemTime(startedAt)
    mocks.getRun.mockImplementation(async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 99_000))
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

  it('allows four sequential Finviz requests to finish without a timeout', () => {
    expect(maxDuration).toBe(120)
  })
})
