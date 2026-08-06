import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getConfiguration: vi.fn(),
  enqueue: vi.fn(),
  process: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdmin }
})

vi.mock('@/lib/newsletter/webhook-outbox', () => ({
  getNewsletterWebhookConfiguration: mocks.getConfiguration,
  enqueueNewsletterWebhookTest: mocks.enqueue,
  processNewsletterWebhookOutbox: mocks.process,
}))

import { POST } from '@/app/api/newsletter/webhook/test/route'
import { AdminAccessError } from '@/lib/auth/admin'

describe('newsletter webhook test route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      user: { id: 'admin-1' },
      isAdmin: true,
      adminConfigured: true,
    })
    mocks.getConfiguration.mockReturnValue({
      configured: true,
      url: 'https://hooks.example.com/newsletter',
      signingSecret: 'redacted',
      missing: [],
      error: null,
    })
    mocks.enqueue.mockResolvedValue({
      outboxId: 'outbox-1',
      eventId: 'event-1',
    })
    mocks.process.mockResolvedValue({
      configured: true,
      claimed: 1,
      delivered: 1,
      failed: 0,
      results: [
        {
          outboxId: 'outbox-1',
          eventId: 'event-1',
          delivered: true,
          attemptCount: 1,
          nextAttemptAt: null,
          error: null,
        },
      ],
    })
  })

  it('requires an administrator before enqueueing a test', async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminAccessError())

    const response = await POST()

    expect(response.status).toBe(403)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('does not enqueue a test without complete webhook configuration', async () => {
    mocks.getConfiguration.mockReturnValue({
      configured: false,
      url: null,
      signingSecret: null,
      missing: ['NEWSLETTER_ALERT_WEBHOOK_SECRET'],
      error: null,
    })

    const response = await POST()

    expect(response.status).toBe(409)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('queues and immediately delivers one admin test event', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(mocks.enqueue).toHaveBeenCalledWith('admin-1')
    expect(mocks.process).toHaveBeenCalledWith({
      limit: 1,
      outboxId: 'outbox-1',
    })
    await expect(response.json()).resolves.toEqual({
      eventId: 'event-1',
      queued: true,
      delivered: true,
    })
  })

  it('keeps a failed test queued and returns its retry time', async () => {
    mocks.process.mockResolvedValue({
      configured: true,
      claimed: 1,
      delivered: 0,
      failed: 1,
      results: [
        {
          outboxId: 'outbox-1',
          eventId: 'event-1',
          delivered: false,
          attemptCount: 1,
          nextAttemptAt: '2026-08-06T12:05:00.000Z',
          error: 'Webhook returned HTTP 503.',
        },
      ],
    })

    const response = await POST()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      eventId: 'event-1',
      queued: true,
      delivered: false,
      retryScheduledAt: '2026-08-06T12:05:00.000Z',
    })
  })
})
