export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  buildNewsletterEditorialShortlistPresentation,
  getNewsletterEditorialShortlist,
  NEWSLETTER_EDITORIAL_SHORTLIST_REASON_CODES,
  NewsletterEditorialShortlistConflictError,
  NewsletterEditorialShortlistNotFoundError,
  NewsletterEditorialShortlistValidationError,
  saveNewsletterEditorialShortlist,
  type NewsletterEditorialShortlistIntentInput,
  type NewsletterEditorialShortlistPresentation,
} from '@/lib/newsletter/editorial-shortlist'
import {
  getNewsletterDailyRun,
  NewsletterDailyRunNotFoundError,
  type NewsletterDailyReadScope,
} from '@/lib/newsletter/daily-runs-read'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

const ITEM_STATUSES = [
  'queued',
  'generating',
  'generated',
  'ready',
  'needs_attention',
  'failed',
  'published',
] as const

const QUALITY_BANDS = ['strong', 'review'] as const
const INTENT_KINDS = ['added', 'removed', 'moved'] as const

class NewsletterEditorialShortlistWireError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterEditorialShortlistWireError'
  }
}

function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new NewsletterEditorialShortlistWireError(`${label} must be an object`)
  }
  return value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new NewsletterEditorialShortlistWireError(`${label} must be a string`)
  }
  return value
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new NewsletterEditorialShortlistWireError(`${label} must be a number`)
  }
  return value
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new NewsletterEditorialShortlistWireError(
      `${label} must be an array of strings`,
    )
  }
  return value
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new NewsletterEditorialShortlistWireError(`${label} is invalid`)
  }
  return value as T[number]
}

function parsePresentation(value: unknown): NewsletterEditorialShortlistPresentation {
  const presentation = record(value, 'presentation')
  const baseline = record(presentation.baseline, 'presentation.baseline')
  if (!Array.isArray(presentation.catalog)) {
    throw new NewsletterEditorialShortlistWireError(
      'presentation.catalog must be an array',
    )
  }

  return {
    baseline: {
      algorithmVersion: stringValue(
        baseline.algorithmVersion,
        'presentation.baseline.algorithmVersion',
      ),
      itemIds: stringArray(
        baseline.itemIds,
        'presentation.baseline.itemIds',
      ),
      fingerprint: stringValue(
        baseline.fingerprint,
        'presentation.baseline.fingerprint',
      ),
    },
    catalog: presentation.catalog.map((value, index) => {
      const item = record(value, `presentation.catalog[${index}]`)
      const draftId = item.draftId
      if (draftId !== null && typeof draftId !== 'string') {
        throw new NewsletterEditorialShortlistWireError(
          `presentation.catalog[${index}].draftId must be a string or null`,
        )
      }
      return {
        itemId: stringValue(
          item.itemId,
          `presentation.catalog[${index}].itemId`,
        ),
        status: enumValue(
          item.status,
          ITEM_STATUSES,
          `presentation.catalog[${index}].status`,
        ),
        qualityBand: enumValue(
          item.qualityBand,
          QUALITY_BANDS,
          `presentation.catalog[${index}].qualityBand`,
        ),
        draftId,
        rank: numberValue(item.rank, `presentation.catalog[${index}].rank`),
        relevanceScore: numberValue(
          item.relevanceScore,
          `presentation.catalog[${index}].relevanceScore`,
        ),
        confidenceScore: numberValue(
          item.confidenceScore,
          `presentation.catalog[${index}].confidenceScore`,
        ),
        evidenceFingerprint: stringValue(
          item.evidenceFingerprint,
          `presentation.catalog[${index}].evidenceFingerprint`,
        ),
      }
    }),
  }
}

function parseIntents(value: unknown): NewsletterEditorialShortlistIntentInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new NewsletterEditorialShortlistWireError('intents must be an array')
  }
  return value.map((value, index) => {
    const intent = record(value, `intents[${index}]`)
    const note = intent.note
    if (note !== undefined && note !== null && typeof note !== 'string') {
      throw new NewsletterEditorialShortlistWireError(
        `intents[${index}].note must be a string or null`,
      )
    }
    return {
      itemId: stringValue(intent.itemId, `intents[${index}].itemId`),
      kind: enumValue(
        intent.kind,
        INTENT_KINDS,
        `intents[${index}].kind`,
      ),
      reasonCode: enumValue(
        intent.reasonCode,
        NEWSLETTER_EDITORIAL_SHORTLIST_REASON_CODES,
        `intents[${index}].reasonCode`,
      ),
      note,
    }
  })
}

async function parsePutBody(request: NextRequest) {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new NewsletterEditorialShortlistWireError(
      'Request body must be valid JSON',
    )
  }
  const body = record(value, 'Request body')
  if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) {
    throw new NewsletterEditorialShortlistWireError(
      'expectedRevision must be an integer zero or greater',
    )
  }
  return {
    expectedRevision: body.expectedRevision as number,
    presentation: parsePresentation(body.presentation),
    selectedItemIds: stringArray(body.selectedItemIds, 'selectedItemIds'),
    intents: parseIntents(body.intents),
    idempotencyKey: stringValue(body.idempotencyKey, 'idempotencyKey'),
  }
}

function requiresSignIn(scope: NewsletterDailyReadScope): boolean {
  return process.env.NODE_ENV === 'production' && !scope.ownerId
}

async function loadConflictState(
  scope: NewsletterDailyReadScope,
  runId: string,
  signal: AbortSignal,
) {
  const [runResult, latestResult] = await Promise.allSettled([
    getNewsletterDailyRun(scope, runId, signal),
    getNewsletterEditorialShortlist(scope, runId, signal),
  ])
  return {
    conflictSnapshotComplete:
      runResult.status === 'fulfilled' && latestResult.status === 'fulfilled',
    run: runResult.status === 'fulfilled' ? runResult.value : null,
    presentation: runResult.status === 'fulfilled'
      ? buildNewsletterEditorialShortlistPresentation(runResult.value)
      : null,
    latest: latestResult.status === 'fulfilled' ? latestResult.value : null,
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof NewsletterEditorialShortlistNotFoundError ||
    error instanceof NewsletterDailyRunNotFoundError
}

function isValidation(error: unknown): boolean {
  return error instanceof NewsletterEditorialShortlistWireError ||
    error instanceof NewsletterEditorialShortlistValidationError
}

type ResolvedScope = Awaited<ReturnType<typeof resolveNewsletterDraftScope>>

async function errorResponse(input: {
  error: unknown
  request: NextRequest
  resolved: ResolvedScope | null
  runId: string | null
}): Promise<NextResponse> {
  const { error, request, resolved, runId } = input
  if (request.signal.aborted) {
    throw request.signal.reason ?? error
  }
  if (
    error instanceof NewsletterEditorialShortlistConflictError &&
    resolved &&
    runId
  ) {
    const state = await loadConflictState(
      resolved.scope,
      runId,
      request.signal,
    )
    request.signal.throwIfAborted()
    const currentRevision =
      state.latest?.revision ?? error.currentRevision ?? 0
    return attachNewsletterDraftSessionCookie(
      privateJson({
        error: error.message,
        code: 'shortlist_conflict',
        currentRevision,
        currentRevisionId: state.latest?.id ?? null,
        conflictSnapshotComplete: state.conflictSnapshotComplete,
        run: state.run,
        shortlist: state.latest,
        latest: state.latest,
        presentation: state.presentation,
      }, 409),
      resolved.createdSessionId,
    )
  }
  if (isValidation(error)) {
    return attachNewsletterDraftSessionCookie(
      privateJson({ error: (error as Error).message }, 400),
      resolved?.createdSessionId ?? null,
    )
  }
  if (isNotFound(error)) {
    return attachNewsletterDraftSessionCookie(
      privateJson({ error: 'Morning Report shortlist not found.' }, 404),
      resolved?.createdSessionId ?? null,
    )
  }

  console.error('[newsletter/daily-runs/:id/shortlist] request failed', error)
  return attachNewsletterDraftSessionCookie(
    privateJson({ error: 'Unable to manage the Morning Report shortlist.' }, 500),
    resolved?.createdSessionId ?? null,
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let resolved: ResolvedScope | null = null
  let runId: string | null = null
  try {
    request.signal.throwIfAborted()
    resolved = await resolveNewsletterDraftScope(request)
    request.signal.throwIfAborted()
    if (requiresSignIn(resolved.scope)) {
      return privateJson(
        { error: 'Sign in to manage the Morning Report shortlist.' },
        401,
      )
    }
    runId = (await context.params).id
    const [run, shortlist] = await Promise.all([
      getNewsletterDailyRun(resolved.scope, runId, request.signal),
      getNewsletterEditorialShortlist(resolved.scope, runId, request.signal),
    ])
    const response = privateJson({
      run,
      presentation: buildNewsletterEditorialShortlistPresentation(run),
      shortlist,
      currentRevision: shortlist?.revision ?? 0,
      currentRevisionId: shortlist?.id ?? null,
    })
    return attachNewsletterDraftSessionCookie(
      response,
      resolved.createdSessionId,
    )
  } catch (error) {
    return errorResponse({ error, request, resolved, runId })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let resolved: ResolvedScope | null = null
  let runId: string | null = null
  try {
    request.signal.throwIfAborted()
    resolved = await resolveNewsletterDraftScope(request)
    request.signal.throwIfAborted()
    if (requiresSignIn(resolved.scope)) {
      return privateJson(
        { error: 'Sign in to manage the Morning Report shortlist.' },
        401,
      )
    }
    runId = (await context.params).id
    const body = await parsePutBody(request)
    request.signal.throwIfAborted()
    const result = await saveNewsletterEditorialShortlist(resolved.scope, {
      runId,
      ...body,
      signal: request.signal,
    })
    const run = await getNewsletterDailyRun(
      resolved.scope,
      runId,
      request.signal,
    )
    const response = privateJson({
      run,
      presentation: buildNewsletterEditorialShortlistPresentation(run),
      shortlist: result.shortlist,
      currentRevision: result.shortlist.revision,
      currentRevisionId: result.shortlist.id,
      changed: result.changed,
      receiptRevisionId: result.receiptRevisionId,
      isCurrent: result.isCurrent,
    })
    return attachNewsletterDraftSessionCookie(
      response,
      resolved.createdSessionId,
    )
  } catch (error) {
    return errorResponse({ error, request, resolved, runId })
  }
}
