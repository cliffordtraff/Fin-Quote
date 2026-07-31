import { afterEach, describe, expect, it } from 'vitest'
import { __testOnly, NewsletterOperatorAccessError } from '../operations'
import type { NewsletterDailyAutomationRun } from '../daily-automation'
import type { NewsletterMidMorningRun } from '../mid-morning-automation'

const mutableEnv = process.env as Record<string, string | undefined>
const originalOwner = process.env.NEWSLETTER_AUTOMATION_OWNER_ID
const originalSession = process.env.NEWSLETTER_AUTOMATION_SESSION_ID

afterEach(() => {
  mutableEnv.NEWSLETTER_AUTOMATION_OWNER_ID = originalOwner
  mutableEnv.NEWSLETTER_AUTOMATION_SESSION_ID = originalSession
})

describe('newsletter operations', () => {
  it('limits operations to the configured owner', () => {
    mutableEnv.NEWSLETTER_AUTOMATION_OWNER_ID = 'owner-1'
    mutableEnv.NEWSLETTER_AUTOMATION_SESSION_ID = 'session-1'

    expect(__testOnly.resolveOperatorScope('owner-1')).toEqual({
      ownerId: 'owner-1',
      sessionId: 'session-1',
    })
    expect(() => __testOnly.resolveOperatorScope('owner-2')).toThrow(
      NewsletterOperatorAccessError,
    )
  })

  it('summarizes retry failures without exposing the full metadata payload', () => {
    expect(
      __testOnly.retryDetails({
        lastFailureStage: 'summaries',
        stageErrorCounts: { finviz: 1, summaries: 3 },
      }),
    ).toEqual({
      retryStage: 'summaries',
      stageFailureCount: 4,
    })
  })

  it('maps morning provider and newsletter metrics', () => {
    const run = {
      id: 'morning-1',
      marketDate: '2026-07-30',
      status: 'completed',
      stage: 'completed',
      candidateCount: 40,
      finvizCompletedCount: 40,
      finvizFoundCount: 38,
      finvizErrorCount: 2,
      summaryCompletedCount: 40,
      summaryGeneratedCount: 39,
      summaryErrorCount: 1,
      newsletterSelectedCount: 5,
      newsletterGeneratedCount: 5,
      newsletterReadyCount: 4,
      newsletterAttentionCount: 1,
      newsletterFailedCount: 0,
      invocationCount: 12,
      lastError: null,
      metadata: {},
      startedAt: null,
      completedAt: null,
      lastHeartbeatAt: null,
      createdAt: '2026-07-30T09:00:00.000Z',
      updatedAt: '2026-07-30T10:00:00.000Z',
    } as NewsletterDailyAutomationRun

    const mapped = __testOnly.mapMorningRun(run)

    expect(mapped.stageLabel).toBe('Morning report ready')
    expect(mapped.metrics).toEqual([
      expect.objectContaining({
        id: 'finviz',
        completed: 40,
        successful: 38,
        errors: 2,
      }),
      expect.objectContaining({
        id: 'summaries',
        completed: 40,
        successful: 39,
        errors: 1,
      }),
      expect.objectContaining({
        id: 'newsletters',
        total: 5,
        successful: 4,
        errors: 1,
      }),
    ])
  })

  it('maps the five-summary mid-morning target', () => {
    const run = {
      id: 'mid-1',
      marketDate: '2026-07-30',
      status: 'completed',
      stage: 'completed',
      candidateCount: 20,
      finvizCompletedCount: 20,
      finvizFoundCount: 20,
      finvizErrorCount: 0,
      summaryCompletedCount: 5,
      summaryGeneratedCount: 5,
      summaryErrorCount: 0,
      meaningfulChange: true,
      invocationCount: 6,
      lastError: null,
      metadata: {},
      startedAt: null,
      completedAt: null,
      lastHeartbeatAt: null,
      createdAt: '2026-07-30T14:15:00.000Z',
      updatedAt: '2026-07-30T15:00:00.000Z',
    } as NewsletterMidMorningRun

    const mapped = __testOnly.mapMidMorningRun(run)

    expect(mapped.meaningfulChange).toBe(true)
    expect(mapped.metrics[1]).toMatchObject({
      id: 'summaries',
      completed: 5,
      total: 5,
      successful: 5,
    })
  })
})
