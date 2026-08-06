import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
}))

vi.mock('@/lib/newsletter/cron-observability', () => ({
  getNewsletterCronHealthSnapshot: mocks.getSnapshot,
}))

import { GET } from '@/app/api/health/newsletter/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('newsletter health endpoint', () => {
  it('returns 200 with the sanitized healthy snapshot', async () => {
    mocks.getSnapshot.mockResolvedValue({
      status: 'healthy',
      checkedAt: '2026-08-10T14:20:00.000Z',
      warnings: [],
      jobs: [
        {
          job: 'daily',
          label: 'Daily newsletter',
          state: 'healthy',
          enabled: true,
          expectedNow: true,
          lastStatus: 'succeeded',
          lastStartedAt: '2026-08-10T14:18:00.000Z',
          lastCompletedAt: '2026-08-10T14:18:10.000Z',
          ageSeconds: 120,
        },
      ],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toMatchObject({ status: 'healthy' })
  })

  it('returns 200 while surfacing an optional disabled webhook warning', async () => {
    mocks.getSnapshot.mockResolvedValue({
      status: 'healthy',
      checkedAt: '2026-08-08T02:00:00.000Z',
      warnings: [
        {
          code: 'webhook_not_configured',
          job: 'webhook_outbox',
          message:
            'Optional newsletter webhook delivery is disabled because its configuration is incomplete.',
        },
      ],
      jobs: [
        {
          job: 'webhook_outbox',
          label: 'Webhook outbox',
          state: 'disabled',
          enabled: false,
          expectedNow: false,
          lastStatus: null,
          lastStartedAt: null,
          lastCompletedAt: null,
          ageSeconds: null,
        },
      ],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: 'healthy',
      warnings: [
        expect.objectContaining({ code: 'webhook_not_configured' }),
      ],
      jobs: [
        expect.objectContaining({
          job: 'webhook_outbox',
          state: 'disabled',
          enabled: false,
        }),
      ],
    })
  })

  it('returns 503 when any critical job is stale or failed', async () => {
    mocks.getSnapshot.mockResolvedValue({
      status: 'unhealthy',
      checkedAt: '2026-08-10T14:20:00.000Z',
      warnings: [],
      jobs: [
        {
          job: 'mid_morning',
          label: 'Mid-morning newsletter',
          state: 'stale',
          enabled: true,
          expectedNow: true,
          lastStatus: 'succeeded',
          lastStartedAt: '2026-08-10T14:00:00.000Z',
          lastCompletedAt: '2026-08-10T14:00:10.000Z',
          ageSeconds: 1_200,
        },
      ],
    })

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      status: 'unhealthy',
      jobs: [expect.objectContaining({ state: 'stale' })],
    })
  })

  it('sanitizes observability backend failures', async () => {
    mocks.getSnapshot.mockRejectedValue(
      new Error('postgres password=super-secret-value'),
    )

    const response = await GET()
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(body).toContain('observability_unavailable')
    expect(body).not.toContain('super-secret-value')
  })
})
