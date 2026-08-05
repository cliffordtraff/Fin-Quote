import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  advance: vi.fn(),
  getClock: vi.fn(),
  getRun: vi.fn(),
  getWindow: vi.fn(),
  log: vi.fn(),
}))

vi.mock('@/lib/newsletter/daily-automation', () => ({
  getNewsletterAutomationClock: mocks.getClock,
}))

vi.mock('@/lib/newsletter/mid-morning-automation', () => ({
  advanceNewsletterMidMorningAutomation: mocks.advance,
  getMidMorningAutomationWindow: mocks.getWindow,
  getNewsletterMidMorningRun: mocks.getRun,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
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
    mocks.getRun.mockResolvedValue(null)
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
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed before reading run state', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(mocks.getRun).not.toHaveBeenCalled()
    expect(mocks.advance).not.toHaveBeenCalled()
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

  it('advances an active run and logs its operational counts', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      skipped: false,
      action: 'summary-batch',
    })
    expect(mocks.advance).toHaveBeenCalledWith({ marketDate: '2026-08-05' })
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'mid-morning',
        event: 'run-advanced',
        candidateCount: 20,
        summaryCompletedCount: 3,
      }),
    )
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
