import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  process: vi.fn(),
  log: vi.fn(),
  markFailed: vi.fn(),
}))

vi.mock('@/lib/newsletter/webhook-outbox', () => ({
  processNewsletterWebhookOutbox: mocks.process,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
}))

vi.mock('@/lib/newsletter/cron-observability', () => ({
  markNewsletterCronResponseFailed: mocks.markFailed,
  withNewsletterCronHeartbeat: mocks.heartbeat,
}))

import { GET } from '@/app/api/cron/newsletter-webhook/route'

function request(authorized = true) {
  return new NextRequest('https://theintraday.com/api/cron/newsletter-webhook', {
    headers: authorized
      ? { authorization: 'Bearer test-cron-secret' }
      : undefined,
  })
}

describe('newsletter webhook cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    mocks.heartbeat.mockImplementation(
      async (_job: string, operation: () => Promise<Response>) => operation(),
    )
    mocks.markFailed.mockImplementation((response: Response) => response)
    mocks.process.mockResolvedValue({
      configured: true,
      claimed: 2,
      delivered: 1,
      failed: 1,
      results: [],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed before claiming delivery work', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(mocks.process).not.toHaveBeenCalled()
    expect(mocks.heartbeat).not.toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'webhook',
        event: 'request-rejected',
      }),
    )
  })

  it('processes one bounded batch and logs delivery counts', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(mocks.heartbeat).toHaveBeenCalledWith(
      'webhook_outbox',
      expect.any(Function),
    )
    expect(mocks.process).toHaveBeenCalledWith({ limit: 5 })
    expect(mocks.markFailed).toHaveBeenCalledTimes(1)
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'webhook',
        event: 'delivery-batch',
        claimed: 2,
        delivered: 1,
        failed: 1,
      }),
    )
  })

  it('treats an unconfigured optional webhook as a successful skipped run', async () => {
    mocks.process.mockResolvedValueOnce({
      configured: false,
      claimed: 0,
      delivered: 0,
      failed: 0,
      results: [],
      configurationError:
        'Missing NEWSLETTER_ALERT_WEBHOOK_URL and NEWSLETTER_ALERT_WEBHOOK_SECRET.',
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      configured: false,
      claimed: 0,
      failed: 0,
    })
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'webhook',
        event: 'delivery-skipped',
        configured: false,
      }),
    )
  })
})
