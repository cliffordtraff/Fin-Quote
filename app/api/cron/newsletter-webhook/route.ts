export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { logNewsletterCron } from '@/lib/newsletter/cron-logging'
import {
  markNewsletterCronResponseFailed,
  withNewsletterCronHeartbeat,
} from '@/lib/newsletter/cron-observability'
import { processNewsletterWebhookOutbox } from '@/lib/newsletter/webhook-outbox'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  if (!isAuthorized(request)) {
    logNewsletterCron({
      job: 'webhook',
      event: 'request-rejected',
      reason: 'unauthorized',
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return withNewsletterCronHeartbeat('webhook_outbox', () =>
    runAuthorizedNewsletterWebhook(startedAt),
  )
}

async function runAuthorizedNewsletterWebhook(startedAt: number) {
  try {
    const result = await processNewsletterWebhookOutbox({ limit: 5 })
    logNewsletterCron({
      job: 'webhook',
      event: result.configured ? 'delivery-batch' : 'delivery-skipped',
      configured: result.configured,
      claimed: result.claimed,
      delivered: result.delivered,
      failed: result.failed,
      configurationError: result.configurationError,
      durationMs: Date.now() - startedAt,
    })
    const response = NextResponse.json(result)
    return result.failed
      ? markNewsletterCronResponseFailed(response)
      : response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logNewsletterCron({
      job: 'webhook',
      event: 'delivery-error',
      level: 'error',
      error: message,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { error: 'Newsletter webhook delivery failed.' },
      { status: 500 },
    )
  }
}
