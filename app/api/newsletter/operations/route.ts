export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationRequiredError,
  requireCurrentUser,
} from '@/lib/auth/current-user'
import { getNewsletterAutomationClock } from '@/lib/newsletter/daily-automation'
import {
  executeNewsletterOperationsAction,
  getNewsletterOperationsSnapshot,
  NewsletterOperatorAccessError,
  NewsletterOperationsActionError,
  type NewsletterOperationsAction,
  type NewsletterOperationsPipeline,
} from '@/lib/newsletter/operations'

const PIPELINES = new Set<NewsletterOperationsPipeline>([
  'morning',
  'mid_morning',
])
const ACTIONS = new Set<NewsletterOperationsAction>([
  'run_now',
  'retry_failed',
])

function errorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error ? error.message : 'Newsletter operations failed.'
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: message }, { status: 401 })
  }
  if (error instanceof NewsletterOperatorAccessError) {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (error instanceof NewsletterOperationsActionError) {
    return NextResponse.json({ error: message }, { status: 409 })
  }
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const user = await requireCurrentUser()
    return NextResponse.json(
      await getNewsletterOperationsSnapshot(user.id),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const body = await request.json().catch(() => ({}))
    const pipeline = body?.pipeline as NewsletterOperationsPipeline
    const action = body?.action as NewsletterOperationsAction
    if (!PIPELINES.has(pipeline) || !ACTIONS.has(action)) {
      return NextResponse.json(
        { error: 'Invalid newsletter operation.' },
        { status: 400 },
      )
    }
    const marketDate =
      typeof body?.marketDate === 'string'
        ? body.marketDate
        : getNewsletterAutomationClock().marketDate
    const result = await executeNewsletterOperationsAction(user.id, {
      pipeline,
      action,
      marketDate,
    })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error)
  }
}
