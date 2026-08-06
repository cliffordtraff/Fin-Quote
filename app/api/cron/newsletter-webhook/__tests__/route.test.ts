import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  log: vi.fn(),
}))

vi.mock('@/lib/newsletter/webhook-outbox', () => ({
  processNewsletterWebhookOutbox: mocks.process,
}))

vi.mock('@/lib/newsletter/cron-logging', () => ({
  logNewsletterCron: mocks.log,
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
    expect(mocks.process).toHaveBeenCalledWith({ limit: 5 })
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
})
