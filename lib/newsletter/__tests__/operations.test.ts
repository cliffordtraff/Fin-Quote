import { afterEach, describe, expect, it } from 'vitest'
import { __testOnly, NewsletterOperatorAccessError } from '../operations'
import type { BeehiivDeliveryRecord } from '@/lib/beehiiv/types'
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

  it('normalizes and aggregates Beehiiv delivery performance', () => {
    const first = {
      stats: {
        email: {
          recipients: 10,
          delivered: 9,
          opens: 5,
          unique_opens: 4,
          clicks: 2,
          unique_clicks: 1,
          unsubscribes: 1,
          spam_reports: 0,
        },
        web: { views: 3, clicks: 1 },
      },
    } as unknown as BeehiivDeliveryRecord
    const second = {
      stats: {
        email: {
          recipients: 5,
          delivered: 5,
          opens: 2,
          unique_opens: 2,
          clicks: 1,
          unique_clicks: 1,
          unsubscribes: 0,
          spam_reports: 1,
        },
        web: { views: 2, clicks: 0 },
      },
    } as unknown as BeehiivDeliveryRecord

    expect(__testOnly.normalizeBeehiivStats(first.stats)).toMatchObject({
      sent: 10,
      delivered: 9,
      openRate: 4 / 9,
      clickRate: 1 / 9,
      bounces: 1,
      webViews: 3,
    })
    expect(__testOnly.aggregateBeehiivStats([first, second])).toMatchObject({
      sent: 15,
      delivered: 14,
      uniqueOpens: 6,
      openRate: 6 / 14,
      uniqueClicks: 2,
      bounces: 1,
      unsubscribes: 1,
      spamReports: 1,
      webViews: 5,
    })
  })

  it('normalizes the post-stats payload returned by Beehiiv', () => {
    const stats = {
      email: {
        total_sent: 1,
        total_delivered: 1,
        total_opened: 2,
        total_unique_opened: 1,
        total_email_clicked_raw: 3,
        total_unique_email_clicked_raw: 2,
        total_email_clicked_verified: 1,
        total_unique_email_clicked_verified: 1,
        total_hard_bounced: 0,
        total_soft_bounced: 0,
        total_unsubscribes: 0,
        total_spam_reported: 0,
        open_rate: 100,
        click_rate: 50,
      },
      web: {
        total_web_viewed: 4,
        total_web_clicked: 2,
        total_unique_web_clicked: 1,
      },
    }

    expect(__testOnly.normalizeBeehiivStats(stats)).toEqual({
      sent: 1,
      delivered: 1,
      opens: 2,
      uniqueOpens: 1,
      openRate: 1,
      clicks: 1,
      uniqueClicks: 1,
      clickRate: 0.5,
      bounces: 0,
      hardBounces: 0,
      softBounces: 0,
      deferred: null,
      suppressed: null,
      bounceRate: 0,
      unsubscribes: 0,
      unsubscribeRate: 0,
      spamReports: 0,
      spamReportRate: 0,
      webViews: 4,
      webClicks: 2,
    })
  })

  it('reports lifecycle freshness and average delivery latency', () => {
    const delivery = {
      lifecycleStatus: 'published',
      syncedAt: '2026-08-06T12:00:00.000Z',
      lastReconciledAt: '2026-08-06T12:05:00.000Z',
      publishedAt: '2026-08-06T12:10:00.000Z',
    } as unknown as BeehiivDeliveryRecord

    expect(
      __testOnly.summarizeBeehiivLifecycle(
        [delivery],
        new Date('2026-08-06T12:20:00.000Z'),
      ),
    ).toEqual({
      latestReconciledAt: '2026-08-06T12:05:00.000Z',
      freshnessMs: 15 * 60_000,
      oldestActiveCheckAt: null,
      averagePublishLatencyMs: 10 * 60_000,
    })
  })

})
