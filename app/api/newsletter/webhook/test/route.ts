export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'
import {
  enqueueNewsletterWebhookTest,
  getNewsletterWebhookConfiguration,
  processNewsletterWebhookOutbox,
} from '@/lib/newsletter/webhook-outbox'

function adminErrorResponse(error: AdminAccessError): NextResponse {
  const unauthenticated = error.message.toLowerCase().includes('signed in')
  return NextResponse.json(
    {
      error: unauthenticated
        ? 'Authentication required.'
        : 'Admin access required.',
    },
    { status: unauthenticated ? 401 : 403 },
  )
}

export async function POST() {
  try {
    const { user } = await requireAdminUser()
    const configuration = getNewsletterWebhookConfiguration()
    if (!configuration.configured) {
      return NextResponse.json(
        {
          error:
            configuration.error ??
            `Missing ${configuration.missing.join(' and ')}.`,
        },
        { status: 409 },
      )
    }

    const queued = await enqueueNewsletterWebhookTest(user.id)
    const result = await processNewsletterWebhookOutbox({
      limit: 1,
      outboxId: queued.outboxId,
    })
    const attempt = result.results.find(
      (candidate) => candidate.outboxId === queued.outboxId,
    )
    if (!attempt?.delivered) {
      return NextResponse.json(
        {
          eventId: queued.eventId,
          queued: true,
          delivered: false,
          retryScheduledAt: attempt?.nextAttemptAt ?? null,
          error: attempt?.error ?? 'The queued test was not claimed.',
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      eventId: queued.eventId,
      queued: true,
      delivered: true,
    })
  } catch (error) {
    if (error instanceof AdminAccessError) return adminErrorResponse(error)
    console.error('Newsletter webhook test failed:', error)
    return NextResponse.json(
      { error: 'Newsletter webhook test failed.' },
      { status: 500 },
    )
  }
}
