export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationRequiredError,
  requireCurrentUser,
} from '@/lib/auth/current-user'
import { getNewsletterAutomationClock } from '@/lib/newsletter/automation-clock'
import {
  executeNewsletterOperationsAction,
  NewsletterOperatorAccessError,
  NewsletterOperationsActionError,
  type NewsletterOperationsAction,
  type NewsletterOperationsPipeline,
  type NewsletterOperationsPipelineAction,
} from '@/lib/newsletter/operations'

const PIPELINES = new Set<NewsletterOperationsPipeline>([
  'morning',
  'mid_morning',
])
const PIPELINE_ACTIONS = new Set<NewsletterOperationsPipelineAction>([
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const body = await request.json().catch(() => ({}))
    const pipeline = body?.pipeline as NewsletterOperationsPipeline
    const action = body?.action as NewsletterOperationsAction
    if (action === 'reconcile_beehiiv') {
      const result = await executeNewsletterOperationsAction(user.id, {
        action,
      })
      return NextResponse.json({ result })
    }
    if (
      !PIPELINES.has(pipeline) ||
      !PIPELINE_ACTIONS.has(action as NewsletterOperationsPipelineAction)
    ) {
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
      action: action as NewsletterOperationsPipelineAction,
      marketDate,
    })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error)
  }
}
