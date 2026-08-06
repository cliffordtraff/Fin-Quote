import 'server-only'

import { createHmac, randomUUID } from 'node:crypto'
import type { Database, Json } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const DEFAULT_BATCH_SIZE = 5
const MAX_BATCH_SIZE = 10
const DELIVERY_TIMEOUT_MS = 10_000
const INITIAL_BACKOFF_MS = 5 * 60_000
const MAX_BACKOFF_MS = 6 * 60 * 60_000
const MINIMUM_SIGNING_SECRET_LENGTH = 32

type OutboxRow =
  Database['public']['Tables']['newsletter_webhook_outbox']['Row']

export type NewsletterWebhookConfiguration =
  | {
      configured: true
      url: string
      signingSecret: string
      missing: []
      error: null
    }
  | {
      configured: false
      url: null
      signingSecret: null
      missing: Array<
        'NEWSLETTER_ALERT_WEBHOOK_URL' | 'NEWSLETTER_ALERT_WEBHOOK_SECRET'
      >
      error: string | null
    }

export type NewsletterWebhookAttemptResult = {
  outboxId: string
  eventId: string
  delivered: boolean
  attemptCount: number
  nextAttemptAt: string | null
  error: string | null
}

export type NewsletterWebhookProcessResult = {
  configured: boolean
  claimed: number
  delivered: number
  failed: number
  results: NewsletterWebhookAttemptResult[]
  configurationError?: string | null
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 2_000)
}

export function getNewsletterWebhookConfiguration(): NewsletterWebhookConfiguration {
  const rawUrl = process.env.NEWSLETTER_ALERT_WEBHOOK_URL?.trim() ?? ''
  const signingSecret =
    process.env.NEWSLETTER_ALERT_WEBHOOK_SECRET?.trim() ?? ''
  const missing: Array<
    'NEWSLETTER_ALERT_WEBHOOK_URL' | 'NEWSLETTER_ALERT_WEBHOOK_SECRET'
  > = []
  if (!rawUrl) missing.push('NEWSLETTER_ALERT_WEBHOOK_URL')
  if (!signingSecret) missing.push('NEWSLETTER_ALERT_WEBHOOK_SECRET')
  if (missing.length > 0) {
    return {
      configured: false,
      url: null,
      signingSecret: null,
      missing,
      error: null,
    }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return {
      configured: false,
      url: null,
      signingSecret: null,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL is not a valid URL.',
    }
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      configured: false,
      url: null,
      signingSecret: null,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL must use HTTP or HTTPS.',
    }
  }
  if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
    return {
      configured: false,
      url: null,
      signingSecret: null,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL must use HTTPS in production.',
    }
  }
  if (signingSecret.length < MINIMUM_SIGNING_SECRET_LENGTH) {
    return {
      configured: false,
      url: null,
      signingSecret: null,
      missing: [],
      error: `NEWSLETTER_ALERT_WEBHOOK_SECRET must be at least ${MINIMUM_SIGNING_SECRET_LENGTH} characters.`,
    }
  }

  return {
    configured: true,
    url: parsedUrl.toString(),
    signingSecret,
    missing: [],
    error: null,
  }
}

export function getNewsletterWebhookBackoffMs(attemptNumber: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attemptNumber))
  const delay = INITIAL_BACKOFF_MS * 2 ** (normalizedAttempt - 1)
  return Math.min(delay, MAX_BACKOFF_MS)
}

export function createNewsletterWebhookSignature(input: {
  eventId: string
  timestamp: string
  body: string
  signingSecret: string
}): string {
  const signedPayload = `${input.eventId}.${input.timestamp}.${input.body}`
  const digest = createHmac('sha256', input.signingSecret)
    .update(signedPayload)
    .digest('hex')
  return `sha256=${digest}`
}

export function createNewsletterWebhookHeaders(input: {
  eventId: string
  timestamp: string
  body: string
  signingSecret: string
}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'the-intraday-newsletter-webhook/1.0',
    'Idempotency-Key': input.eventId,
    'X-The-Intraday-Event-Id': input.eventId,
    'X-The-Intraday-Timestamp': input.timestamp,
    'X-The-Intraday-Signature': createNewsletterWebhookSignature(input),
  }
}

async function completeAttempt(
  row: OutboxRow,
  leaseToken: string,
  input: {
    delivered: boolean
    error: string | null
    nextAttemptAt: string
  },
): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'complete_newsletter_webhook_attempt',
    {
      p_outbox_id: row.id,
      p_lease_token: leaseToken,
      p_delivered: input.delivered,
      p_error: input.error,
      p_next_attempt_at: input.nextAttemptAt,
    },
  )
  if (error) {
    throw new Error(`Failed to record webhook attempt: ${error.message}`)
  }
  if (!data || data.length === 0) {
    throw new Error('Webhook outbox lease expired before completion.')
  }
}

async function deliverClaimedRow(
  row: OutboxRow,
  input: {
    leaseToken: string
    url: string
    signingSecret: string
    fetchImpl: typeof fetch
    now: () => Date
  },
): Promise<NewsletterWebhookAttemptResult> {
  const attemptCount = row.attempt_count + 1
  const timestamp = input.now().toISOString()
  const body = JSON.stringify(row.payload_json)
  const nextAttemptAt = new Date(
    input.now().getTime() + getNewsletterWebhookBackoffMs(attemptCount),
  ).toISOString()
  let delivered = false
  let deliveryError: string | null = null

  try {
    const response = await input.fetchImpl(input.url, {
      method: 'POST',
      headers: createNewsletterWebhookHeaders({
        eventId: row.event_id,
        timestamp,
        body,
        signingSecret: input.signingSecret,
      }),
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}.`)
    }
    delivered = true
  } catch (error) {
    deliveryError = normalizeError(error)
  }

  try {
    await completeAttempt(row, input.leaseToken, {
      delivered,
      error: deliveryError,
      nextAttemptAt,
    })
  } catch (error) {
    return {
      outboxId: row.id,
      eventId: row.event_id,
      delivered: false,
      attemptCount,
      nextAttemptAt,
      error: normalizeError(error),
    }
  }

  return {
    outboxId: row.id,
    eventId: row.event_id,
    delivered,
    attemptCount,
    nextAttemptAt: delivered ? null : nextAttemptAt,
    error: deliveryError,
  }
}

export async function processNewsletterWebhookOutbox(
  options: {
    limit?: number
    outboxId?: string
    fetchImpl?: typeof fetch
    now?: () => Date
  } = {},
): Promise<NewsletterWebhookProcessResult> {
  const configuration = getNewsletterWebhookConfiguration()
  if (!configuration.configured) {
    return {
      configured: false,
      claimed: 0,
      delivered: 0,
      failed: 0,
      results: [],
      configurationError:
        configuration.error ??
        `Missing ${configuration.missing.join(' and ')}.`,
    }
  }

  const limit = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Math.floor(options.limit ?? DEFAULT_BATCH_SIZE)),
  )
  const leaseToken = randomUUID()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_webhook_outbox',
    {
      p_lease_token: leaseToken,
      p_limit: limit,
      p_lease_seconds: 45,
      p_outbox_id: options.outboxId ?? null,
    },
  )
  if (error) {
    throw new Error(`Failed to claim webhook outbox: ${error.message}`)
  }

  const claimed = (data ?? []) as OutboxRow[]
  const results = await Promise.all(
    claimed.map((row) =>
      deliverClaimedRow(row, {
        leaseToken,
        url: configuration.url,
        signingSecret: configuration.signingSecret,
        fetchImpl: options.fetchImpl ?? fetch,
        now: options.now ?? (() => new Date()),
      }),
    ),
  )
  return {
    configured: true,
    claimed: claimed.length,
    delivered: results.filter((result) => result.delivered).length,
    failed: results.filter((result) => !result.delivered).length,
    results,
  }
}

export async function enqueueNewsletterWebhookTest(
  adminUserId: string,
  now = new Date(),
): Promise<{ outboxId: string; eventId: string }> {
  const id = randomUUID()
  const payload: Json = {
    source: 'the-intraday-newsletter',
    eventId: id,
    eventType: 'webhook.test',
    createdAt: now.toISOString(),
    message: 'The Intraday newsletter webhook test succeeded.',
  }
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('newsletter_webhook_outbox')
    .insert({
      id,
      event_id: id,
      notification_id: null,
      scope_key: `admin:${adminUserId}`,
      payload_json: payload,
      next_attempt_at: now.toISOString(),
    })
    .select('id,event_id')
    .single()
  if (error || !data) {
    throw new Error(
      `Failed to enqueue webhook test: ${error?.message ?? 'No row returned'}`,
    )
  }
  return { outboxId: data.id, eventId: data.event_id }
}
