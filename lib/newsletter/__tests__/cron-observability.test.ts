import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  firstEq: vi.fn(),
  secondEq: vi.fn(),
  select: vi.fn(),
  queryEq: vi.fn(),
  queryIn: vi.fn(),
  runningEq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  getWebhookConfiguration: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

vi.mock('@/lib/newsletter/webhook-outbox', () => ({
  getNewsletterWebhookConfiguration: mocks.getWebhookConfiguration,
}))

import {
  __testOnly,
  evaluateNewsletterCronHealth,
  getNewsletterCronHealthSnapshot,
  markNewsletterCronResponseFailed,
  NEWSLETTER_CRON_JOBS,
  withNewsletterCronHeartbeat,
} from '../cron-observability'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insert.mockResolvedValue({ error: null })
  mocks.secondEq.mockResolvedValue({ error: null })
  mocks.firstEq.mockReturnValue({ eq: mocks.secondEq })
  mocks.update.mockReturnValue({ eq: mocks.firstEq })
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  mocks.limit.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.order.mockReturnValue({ limit: mocks.limit })
  mocks.queryEq.mockReturnValue({ order: mocks.order })
  mocks.runningEq.mockResolvedValue({ data: [], error: null })
  mocks.queryIn.mockReturnValue({ eq: mocks.runningEq })
  mocks.select.mockImplementation((columns: string) =>
    columns === 'job_name,started_at'
      ? { in: mocks.queryIn }
      : { eq: mocks.queryEq },
  )
  mocks.from.mockReturnValue({
    insert: mocks.insert,
    update: mocks.update,
    select: mocks.select,
  })
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
  mocks.getWebhookConfiguration.mockReturnValue({
    configured: true,
    url: 'https://example.com/newsletter-webhook',
    signingSecret: 'x'.repeat(32),
    missing: [],
    error: null,
  })
})

describe('newsletter cron heartbeat persistence', () => {
  it('records an authorized route from start through success', async () => {
    const times = [
      new Date('2026-08-10T14:20:00.000Z'),
      new Date('2026-08-10T14:20:02.500Z'),
    ]

    const response = await withNewsletterCronHeartbeat(
      'daily',
      async () => Response.json({ ok: true }),
      {
        createId: () => '00000000-0000-4000-8000-000000000001',
        now: () => times.shift() ?? times[0],
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.has('x-newsletter-cron-reported-failure')).toBe(
      false,
    )
    expect(mocks.insert).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000001',
      job_name: 'daily',
      status: 'running',
      started_at: '2026-08-10T14:20:00.000Z',
    })
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'succeeded',
      completed_at: '2026-08-10T14:20:02.500Z',
      duration_ms: 2_500,
      error_code: null,
    })
  })

  it('stores only a fixed error code and rethrows operation failures', async () => {
    const sensitiveMessage = 'provider failed with token super-secret-token'
    const times = [
      new Date('2026-08-10T14:20:00.000Z'),
      new Date('2026-08-10T14:20:01.000Z'),
    ]

    await expect(
      withNewsletterCronHeartbeat(
        'beehiiv_reconciliation',
        async () => {
          throw new Error(sensitiveMessage)
        },
        {
          createId: () => '00000000-0000-4000-8000-000000000002',
          now: () => times.shift() ?? times[0],
        },
      ),
    ).rejects.toThrow(sensitiveMessage)

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_code: 'unhandled_exception',
      }),
    )
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain(
      'super-secret-token',
    )
  })

  it('records a logical job failure even when the route keeps HTTP 200', async () => {
    const times = [
      new Date('2026-08-10T14:20:00.000Z'),
      new Date('2026-08-10T14:20:01.000Z'),
    ]

    const response = await withNewsletterCronHeartbeat(
      'mid_morning',
      async () =>
        markNewsletterCronResponseFailed(Response.json({ terminal: true })),
      {
        createId: () => '00000000-0000-4000-8000-000000000003',
        now: () => times.shift() ?? times[0],
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.has('x-newsletter-cron-reported-failure')).toBe(
      false,
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_code: 'reported_failure',
      }),
    )
  })

  it('does not make a heartbeat write failure block cron work', async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: 'database down' } })

    const response = await withNewsletterCronHeartbeat(
      'webhook_outbox',
      async () => new Response(null, { status: 204 }),
    )

    expect(response.status).toBe(204)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('newsletter cron health evaluation', () => {
  const now = new Date('2026-08-10T14:20:00.000Z')

  function healthyRows(startedAt = '2026-08-10T14:18:00.000Z') {
    return Object.fromEntries(
      NEWSLETTER_CRON_JOBS.map((job) => [
        job,
        {
          job_name: job,
          status: 'succeeded',
          started_at: startedAt,
          completed_at: '2026-08-10T14:18:10.000Z',
        },
      ]),
    )
  }

  it('matches the installed pg_cron UTC windows', () => {
    expect(
      __testOnly.isJobExpectedNow(
        'daily',
        new Date('2026-08-10T07:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'daily',
        new Date('2026-08-10T07:00:59.999Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'daily',
        new Date('2026-08-10T07:01:00.000Z'),
      ),
    ).toBe(true)
    expect(
      __testOnly.isJobExpectedNow(
        'daily',
        new Date('2026-08-10T18:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'mid_morning',
        new Date('2026-08-10T13:59:00.000Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'mid_morning',
        new Date('2026-08-10T14:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'mid_morning',
        new Date('2026-08-10T14:02:00.000Z'),
      ),
    ).toBe(true)
    expect(
      __testOnly.isJobExpectedNow(
        'beehiiv_reconciliation',
        new Date('2026-08-10T12:00:59.999Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'beehiiv_reconciliation',
        new Date('2026-08-10T12:01:00.000Z'),
      ),
    ).toBe(true)
    expect(
      __testOnly.isJobExpectedNow(
        'beehiiv_reconciliation',
        new Date('2026-08-10T23:59:00.000Z'),
      ),
    ).toBe(true)
    expect(
      __testOnly.isJobExpectedNow(
        'beehiiv_reconciliation',
        new Date('2026-08-11T00:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      __testOnly.isJobExpectedNow(
        'webhook_outbox',
        new Date('2026-08-09T03:00:00.000Z'),
      ),
    ).toBe(true)
  })

  it('is healthy when every currently scheduled job is fresh', () => {
    const snapshot = evaluateNewsletterCronHealth(healthyRows(), now)

    expect(snapshot.status).toBe('healthy')
    expect(snapshot.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ job: 'daily', state: 'healthy' }),
        expect.objectContaining({ job: 'mid_morning', state: 'healthy' }),
        expect.objectContaining({ job: 'webhook_outbox', state: 'healthy' }),
      ]),
    )
  })

  it('marks an overdue scheduled job stale', () => {
    const rows = healthyRows() as Record<string, Record<string, unknown>>
    rows.mid_morning = {
      ...rows.mid_morning,
      started_at: '2026-08-10T14:09:00.000Z',
      completed_at: '2026-08-10T14:09:10.000Z',
    }

    const snapshot = evaluateNewsletterCronHealth(rows, now)

    expect(snapshot.status).toBe('unhealthy')
    expect(snapshot.jobs).toContainEqual(
      expect.objectContaining({ job: 'mid_morning', state: 'stale' }),
    )
  })

  it('does not alert for a missing first heartbeat until the cron-period grace ends', () => {
    const rows = {
      webhook_outbox: {
        job_name: 'webhook_outbox',
        status: 'succeeded',
        started_at: '2026-08-10T06:59:30.000Z',
        completed_at: '2026-08-10T06:59:35.000Z',
      },
    }
    const atWindowStart = evaluateNewsletterCronHealth(
      rows,
      new Date('2026-08-10T07:00:00.000Z'),
    )
    const afterGrace = evaluateNewsletterCronHealth(
      rows,
      new Date('2026-08-10T07:01:00.000Z'),
    )

    expect(atWindowStart.status).toBe('healthy')
    expect(atWindowStart.jobs).toContainEqual(
      expect.objectContaining({
        job: 'daily',
        expectedNow: false,
        state: 'idle',
      }),
    )
    expect(afterGrace.jobs).toContainEqual(
      expect.objectContaining({
        job: 'daily',
        expectedNow: true,
        state: 'stale',
      }),
    )
    expect(afterGrace.status).toBe('unhealthy')
  })

  it('keeps the one-minute Beehiiv cadence fresh through its ten-minute threshold', () => {
    const rows = {
      beehiiv_reconciliation: {
        job_name: 'beehiiv_reconciliation',
        status: 'succeeded',
        started_at: '2026-08-10T12:00:00.000Z',
        completed_at: '2026-08-10T12:00:10.000Z',
      },
    }

    const beforeThreshold = evaluateNewsletterCronHealth(
      rows,
      new Date('2026-08-10T12:09:59.999Z'),
      { webhookOutboxEnabled: false },
    )
    const afterThreshold = evaluateNewsletterCronHealth(
      rows,
      new Date('2026-08-10T12:10:00.001Z'),
      { webhookOutboxEnabled: false },
    )

    expect(beforeThreshold.jobs).toContainEqual(
      expect.objectContaining({
        job: 'beehiiv_reconciliation',
        state: 'healthy',
      }),
    )
    expect(afterThreshold.jobs).toContainEqual(
      expect.objectContaining({
        job: 'beehiiv_reconciliation',
        state: 'stale',
      }),
    )
  })

  it('marks a job stale when any older running heartbeat is orphaned', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        job_name: 'daily',
        status: 'succeeded',
        started_at: '2026-08-10T14:19:00.000Z',
        completed_at: '2026-08-10T14:19:05.000Z',
      },
      error: null,
    })
    mocks.runningEq.mockResolvedValue({
      data: [
        {
          id: 'raw-run-id-must-not-be-public',
          job_name: 'daily',
          started_at: '2026-08-10T14:09:59.999Z',
        },
        {
          id: 'fresh-running-row',
          job_name: 'daily',
          started_at: '2026-08-10T14:19:59.999Z',
        },
      ],
      error: null,
    })

    const snapshot = await getNewsletterCronHealthSnapshot(
      new Date('2026-08-10T14:20:00.000Z'),
    )

    expect(mocks.queryIn).toHaveBeenCalledWith(
      'job_name',
      NEWSLETTER_CRON_JOBS,
    )
    expect(mocks.runningEq).toHaveBeenCalledWith('status', 'running')
    expect(snapshot.status).toBe('unhealthy')
    expect(snapshot.jobs).toContainEqual(
      expect.objectContaining({
        job: 'daily',
        lastStatus: 'succeeded',
        state: 'stale',
      }),
    )
    expect(JSON.stringify(snapshot)).not.toContain('raw-run-id-must-not-be-public')
  })

  it('keeps a missing optional webhook configuration healthy but visible', () => {
    const rows = healthyRows()
    delete rows.webhook_outbox

    const snapshot = evaluateNewsletterCronHealth(rows, now, {
      webhookOutboxEnabled: false,
      webhookOutboxWarning: 'webhook_not_configured',
    })

    expect(snapshot.status).toBe('healthy')
    expect(snapshot.jobs).toContainEqual(
      expect.objectContaining({
        job: 'webhook_outbox',
        state: 'disabled',
        enabled: false,
        expectedNow: false,
      }),
    )
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        code: 'webhook_not_configured',
        job: 'webhook_outbox',
      }),
    ])
  })

  it('keeps a configured webhook outbox critical', () => {
    const rows = healthyRows()
    delete rows.webhook_outbox

    const snapshot = evaluateNewsletterCronHealth(rows, now, {
      webhookOutboxEnabled: true,
    })

    expect(snapshot.status).toBe('unhealthy')
    expect(snapshot.jobs).toContainEqual(
      expect.objectContaining({
        job: 'webhook_outbox',
        state: 'stale',
        enabled: true,
        expectedNow: true,
      }),
    )
    expect(snapshot.warnings).toEqual([])
  })

  it('uses a sanitized warning when webhook configuration is invalid', () => {
    const snapshot = evaluateNewsletterCronHealth(healthyRows(), now, {
      webhookOutboxEnabled: false,
      webhookOutboxWarning: 'webhook_configuration_invalid',
    })

    expect(snapshot.status).toBe('healthy')
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        code: 'webhook_configuration_invalid',
        message: expect.not.stringContaining('NEWSLETTER_ALERT_WEBHOOK_SECRET'),
      }),
    ])
  })

  it('keeps off-window jobs idle but preserves terminal failures', () => {
    const saturday = new Date('2026-08-08T02:00:00.000Z')
    const rows = {
      webhook_outbox: {
        job_name: 'webhook_outbox',
        status: 'succeeded',
        started_at: '2026-08-08T01:55:00.000Z',
        completed_at: '2026-08-08T01:55:05.000Z',
      },
    }
    const healthy = evaluateNewsletterCronHealth(rows, saturday)
    expect(healthy.status).toBe('healthy')
    expect(healthy.jobs).toContainEqual(
      expect.objectContaining({ job: 'daily', state: 'idle' }),
    )

    const failed = evaluateNewsletterCronHealth(
      {
        ...rows,
        daily: {
          job_name: 'daily',
          status: 'failed',
          started_at: '2026-08-07T17:58:00.000Z',
          completed_at: '2026-08-07T17:58:10.000Z',
        },
      },
      saturday,
    )
    expect(failed.status).toBe('unhealthy')
    expect(failed.jobs).toContainEqual(
      expect.objectContaining({ job: 'daily', state: 'failed' }),
    )
  })

  it('derives disabled webhook health from the runtime configuration', async () => {
    mocks.getWebhookConfiguration.mockReturnValue({
      configured: false,
      url: null,
      signingSecret: null,
      missing: [
        'NEWSLETTER_ALERT_WEBHOOK_URL',
        'NEWSLETTER_ALERT_WEBHOOK_SECRET',
      ],
      error: null,
    })

    const snapshot = await getNewsletterCronHealthSnapshot(
      new Date('2026-08-08T02:00:00.000Z'),
    )

    expect(snapshot.status).toBe('healthy')
    expect(snapshot.jobs).toContainEqual(
      expect.objectContaining({
        job: 'webhook_outbox',
        state: 'disabled',
        enabled: false,
      }),
    )
    expect(snapshot.warnings).toContainEqual(
      expect.objectContaining({ code: 'webhook_not_configured' }),
    )
  })
})
