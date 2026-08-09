export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { BeehiivReconnectRequiredError } from '@/lib/beehiiv/client'
import { getBeehiivDelivery } from '@/lib/beehiiv/store'
import { beehiivDeliveryNeedsSync } from '@/lib/beehiiv/sync-freshness'
import {
  BeehiivDeliveryConflictError,
  deliverNewsletterDraftToBeehiiv,
} from '@/lib/newsletter/beehiiv-delivery'
import {
  NewsletterDraftAuthError,
  NewsletterDraftNotFoundError,
  getNewsletterDraft,
} from '@/lib/newsletter/drafts'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

function errorResponse(error: unknown): NextResponse {
  if (error instanceof NewsletterDraftAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  if (error instanceof NewsletterDraftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof BeehiivReconnectRequiredError) {
    return NextResponse.json(
      { error: error.message, reconnectRequired: true },
      { status: 409 },
    )
  }
  if (error instanceof BeehiivDeliveryConflictError) {
    return NextResponse.json(
      { error: error.message, conflictCode: error.code },
      { status: error.code === 'busy' ? 423 : 422 },
    )
  }

  const message =
    error instanceof Error
      ? error.message
      : 'Failed to sync the newsletter draft with Beehiiv'
  const status =
    message.startsWith('Connect Beehiiv') ||
    message.startsWith('No Beehiiv publication')
      ? 409
      : 500
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    if (!scope.ownerId) {
      throw new NewsletterDraftAuthError(
        'Sign in before connecting or sending a draft to Beehiiv.',
      )
    }
    const record = await getNewsletterDraft(scope, id)
    const delivery = await getBeehiivDelivery(scope.ownerId, id)
    const response = NextResponse.json({
      delivery,
      needsSync: delivery
        ? beehiivDeliveryNeedsSync(record.updatedAt, delivery)
        : false,
    })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { scope, createdSessionId } =
      await resolveNewsletterDraftScope(request)
    const result = await deliverNewsletterDraftToBeehiiv({
      scope,
      draftId: id,
      host: request.headers.get('host'),
    })
    const record = await getNewsletterDraft(scope, id)
    const response = NextResponse.json({
      ...result,
      needsSync: beehiivDeliveryNeedsSync(
        record.updatedAt,
        result.delivery,
      ),
    })
    return attachNewsletterDraftSessionCookie(response, createdSessionId)
  } catch (error) {
    return errorResponse(error)
  }
}
