import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AdminAccessError, requireAdminUser } from '@/lib/auth/admin'
import type {
  WhyMovedCandidate,
  WhyMovedCandidateSnapshot,
  WhyMovedEditorialReviewRecord,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'

export const PRIVATE_COMMAND_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
} as const

const symbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,9}$/)
const timestampSchema = z.string().datetime({ offset: true })
const candidateSnapshotSchema = z.object({
  reviewKey: z.string().trim().min(1).max(180),
  symbol: symbolSchema,
  name: z.string().max(200).nullable(),
  price: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changesPercentage: z.number().finite().nullable(),
  direction: z.enum(['gainer', 'loser']),
  session: z.enum(['premarket', 'cash', 'afterhours', 'closed']),
  marketDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const reviewUpdateSchema = z.object({
  candidate: candidateSnapshotSchema,
  status: z.enum(['pending', 'approved', 'needs_work', 'dismissed']),
  notes: z.string().max(1000),
  expectedUpdatedAt: timestampSchema,
})

export const bulkReviewSchema = z.object({
  targetStatus: z.enum(['pending', 'needs_work', 'dismissed']),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        expectedUpdatedAt: timestampSchema,
      }),
    )
    .min(1)
    .max(100),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  confirmed: z.literal(true),
})

export const previewSchema = z.object({ symbol: symbolSchema })

export function privateJson(
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: PRIVATE_COMMAND_HEADERS,
  })
}

function isEditConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'edit_conflict'
  )
}

export function commandErrorResponse(
  error: unknown,
  fallback: string,
): NextResponse {
  const message = error instanceof Error ? error.message : fallback
  if (error instanceof CommandBodyError) {
    return commandBodyErrorResponse(error)
  }
  if (error instanceof AdminAccessError) {
    return privateJson(
      { success: false, error: message },
      {
        status: message.includes('must be signed in') ? 401 : 403,
      },
    )
  }
  if (isEditConflict(error)) {
    return privateJson(
      { success: false, conflict: true, error: message },
      { status: 409 },
    )
  }
  return privateJson({ success: false, error: message }, { status: 500 })
}

/**
 * Server Actions validate their caller's origin for us. These cookie-authenticated
 * HTTP replacements must retain that protection explicitly.
 */
function crossSiteMutationResponse(request: NextRequest): NextResponse | null {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return privateJson(
      { success: false, error: 'Cross-site admin commands are not allowed.' },
      { status: 403 },
    )
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) {
    return privateJson(
      { success: false, error: 'Cross-site admin commands are not allowed.' },
      { status: 403 },
    )
  }
  return null
}

export async function authorizeAdminCommand(
  request: NextRequest,
): Promise<
  | { response: NextResponse; user: null }
  | { response: null; user: Awaited<ReturnType<typeof requireAdminUser>>['user'] }
> {
  const crossSiteResponse = crossSiteMutationResponse(request)
  if (crossSiteResponse) return { response: crossSiteResponse, user: null }
  const { user } = await requireAdminUser()
  return { response: null, user }
}

export async function parseCommandJson(request: NextRequest): Promise<unknown> {
  request.signal.throwIfAborted()
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    throw new CommandBodyError('Admin command body is too large.', 413)
  }
  try {
    const body = await request.json()
    request.signal.throwIfAborted()
    return body
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason ?? error
    throw new CommandBodyError('Admin command body must be valid JSON.', 400)
  }
}

export class CommandBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message)
    this.name = 'CommandBodyError'
  }
}

export function commandBodyErrorResponse(error: CommandBodyError): NextResponse {
  return privateJson(
    { success: false, error: error.message },
    { status: error.status },
  )
}

export function invalidCommandResponse(message: string): NextResponse {
  return privateJson({ success: false, error: message }, { status: 400 })
}

export function mutableCandidate(
  snapshot: WhyMovedCandidateSnapshot,
): WhyMovedCandidate {
  return {
    reviewKey: snapshot.reviewKey,
    symbol: snapshot.symbol.toUpperCase(),
    name: snapshot.name ?? snapshot.symbol.toUpperCase(),
    price: snapshot.price ?? 0,
    change: snapshot.change ?? 0,
    changesPercentage: snapshot.changesPercentage ?? 0,
    direction: snapshot.direction,
    session: snapshot.session,
    marketDate: snapshot.marketDate,
  }
}

export function isEditorialReview(
  review: WhyMovedReviewRecord,
): review is WhyMovedEditorialReviewRecord {
  const candidateSnapshot = (
    review as Partial<WhyMovedEditorialReviewRecord>
  ).candidateSnapshot
  const catalystSnapshot = (
    review as Partial<WhyMovedEditorialReviewRecord>
  ).catalystSnapshot
  return Boolean(
    candidateSnapshot &&
      catalystSnapshot &&
      typeof (
        review as Partial<WhyMovedEditorialReviewRecord>
      ).firstSeenAt === 'string',
  )
}
