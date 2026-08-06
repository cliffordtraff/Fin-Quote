import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import {
  createNewsletterWebhookHeaders,
  getNewsletterWebhookBackoffMs,
  processNewsletterWebhookOutbox,
} from '../webhook-outbox'

const TEST_SIGNING_SECRET = 'x'.repeat(32)

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    event_id: '20000000-0000-4000-8000-000000000002',
    notification_id: '20000000-0000-4000-8000-000000000002',
    scope_key: 'owner:owner-1',
    payload_json: {
      source: 'the-intraday-newsletter',
      eventId: '20000000-0000-4000-8000-000000000002',
      eventType: 'newsletter.notification',
    },
    status: 'pending',
    attempt_count: 0,
    next_attempt_at: '2026-08-06T12:00:00.000Z',
    last_attempt_at: null,
    last_error: null,
    delivered_at: null,
    lease_token: null,
    lease_expires_at: null,
    created_at: '2026-08-06T12:00:00.000Z',
    updated_at: '2026-08-06T12:00:00.000Z',
    ...overrides,
  }
}

describe('newsletter webhook outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv(
      'NEWSLETTER_ALERT_WEBHOOK_URL',
      'https://hooks.example.com/newsletter',
    )
    vi.stubEnv(
      'NEWSLETTER_ALERT_WEBHOOK_SECRET',
      TEST_SIGNING_SECRET,
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signs the exact event id, timestamp, and body with HMAC-SHA256', () => {
    const input = {
      eventId: 'event-123',
      timestamp: '2026-08-06T12:00:00.000Z',
      body: '{"hello":"world"}',
      signingSecret: TEST_SIGNING_SECRET,
    }

    const headers = createNewsletterWebhookHeaders(input)
    const expected = createHmac('sha256', input.signingSecret)
      .update(`${input.eventId}.${input.timestamp}.${input.body}`)
      .digest('hex')

    expect(headers).toMatchObject({
      'Idempotency-Key': input.eventId,
      'X-The-Intraday-Event-Id': input.eventId,
      'X-The-Intraday-Timestamp': input.timestamp,
      'X-The-Intraday-Signature': `sha256=${expected}`,
    })
  })

  it('delivers a claimed event and records the successful attempt', async () => {
    const row = outboxRow()
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({
        data: [{ ...row, status: 'delivered' }],
        error: null,
      })
    mocks.createServiceRoleClient.mockReturnValue({ rpc })
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const now = () => new Date('2026-08-06T12:00:00.000Z')

    const result = await processNewsletterWebhookOutbox({
      fetchImpl: fetchImpl as typeof fetch,
      now,
    })

    expect(result).toMatchObject({
      configured: true,
      claimed: 1,
      delivered: 1,
      failed: 0,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hooks.example.com/newsletter',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(row.payload_json),
        headers: expect.objectContaining({
          'Idempotency-Key': row.event_id,
          'X-The-Intraday-Event-Id': row.event_id,
        }),
      }),
    )
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'complete_newsletter_webhook_attempt',
      expect.objectContaining({
        p_outbox_id: row.id,
        p_delivered: true,
        p_error: null,
      }),
    )
  })

  it('records a failure and schedules exponential retry with the same event id', async () => {
    const row = outboxRow({
      attempt_count: 2,
      payload_json: {
        source: 'the-intraday-newsletter',
        eventId: '20000000-0000-4000-8000-000000000002',
        eventType: 'newsletter.notification',
        notification: { message: 'Original immutable event snapshot' },
      },
    })
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
    mocks.createServiceRoleClient.mockReturnValue({ rpc })
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const now = () => new Date('2026-08-06T12:00:00.000Z')

    const result = await processNewsletterWebhookOutbox({
      fetchImpl: fetchImpl as typeof fetch,
      now,
    })

    expect(getNewsletterWebhookBackoffMs(3)).toBe(20 * 60_000)
    expect(result).toMatchObject({
      claimed: 1,
      delivered: 0,
      failed: 1,
      results: [
        {
          eventId: row.event_id,
          attemptCount: 3,
          nextAttemptAt: '2026-08-06T12:20:00.000Z',
          error: 'Webhook returned HTTP 503.',
        },
      ],
    })
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'complete_newsletter_webhook_attempt',
      expect.objectContaining({
        p_delivered: false,
        p_error: 'Webhook returned HTTP 503.',
        p_next_attempt_at: '2026-08-06T12:20:00.000Z',
      }),
    )
    const request = fetchImpl.mock.calls[0]?.[1]
    expect(request.headers['Idempotency-Key']).toBe(row.event_id)
    expect(request.body).toBe(JSON.stringify(row.payload_json))
  })

  it('does not claim rows until both destination and signing secret exist', async () => {
    vi.stubEnv('NEWSLETTER_ALERT_WEBHOOK_SECRET', '')

    const result = await processNewsletterWebhookOutbox()

    expect(result).toMatchObject({
      configured: false,
      claimed: 0,
      delivered: 0,
      configurationError: 'Missing NEWSLETTER_ALERT_WEBHOOK_SECRET.',
    })
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })
})
