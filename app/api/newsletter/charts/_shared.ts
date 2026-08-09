import { NextRequest, NextResponse } from 'next/server'
import {
  attachNewsletterDraftSessionCookie,
  resolveNewsletterDraftScope,
} from '@/lib/newsletter/draft-session'
import { isAllowedNewsletterChartOrigin } from '@/lib/newsletter/chart-api-origin'
import { NewsletterCapturePathError } from '@/lib/newsletter/capture-output-path'
import { NewsletterChartPostError } from '@/lib/newsletter/chart-post-admission'
import { NewsletterChartLibraryNotFoundError } from '@/lib/newsletter/chart-library-errors'

export const MAX_NEWSLETTER_CHART_REQUEST_BYTES = 256 * 1024
export const MAX_NEWSLETTER_CHART_SERVER_ERROR_LOG_CHARS = 2_048

export type NewsletterChartApiMethod =
  | 'GET'
  | 'POST'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'

export type NewsletterChartApiMethods = readonly NewsletterChartApiMethod[]

type ResolvedNewsletterChartScope = Awaited<
  ReturnType<typeof resolveNewsletterDraftScope>
>

export type NewsletterChartAccessResult =
  | {
      access: ResolvedNewsletterChartScope
      response: null
    }
  | {
      access: null
      response: NextResponse
    }

export class NewsletterChartRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415,
  ) {
    super(message)
    this.name = 'NewsletterChartRequestError'
  }
}

function appendVary(response: NextResponse, value: string): void {
  const current = response.headers.get('Vary')
  const values = new Set(
    (current ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  values.add(value)
  response.headers.set('Vary', Array.from(values).join(', '))
}

function applyNewsletterChartResponseHeaders(
  response: NextResponse,
  request: NextRequest,
  methods: NewsletterChartApiMethods,
): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Access-Control-Allow-Methods', methods.join(','))
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type,Idempotency-Key',
  )
  response.headers.set(
    'Access-Control-Expose-Headers',
    'X-Idempotency-Replay,X-Newsletter-Session-Established,Retry-After',
  )
  appendVary(response, 'Origin')

  const origin = request.headers.get('origin')
  if (origin && isAllowedNewsletterChartOrigin(request)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return response
}

export function newsletterChartJson(
  request: NextRequest,
  methods: NewsletterChartApiMethods,
  body: unknown,
  init: ResponseInit = {},
): NextResponse {
  return applyNewsletterChartResponseHeaders(
    NextResponse.json(body, init),
    request,
    methods,
  )
}

export function finalizeNewsletterChartResponse(
  response: NextResponse,
  request: NextRequest,
  methods: NewsletterChartApiMethods,
  createdSessionId: string | null,
): NextResponse {
  return applyNewsletterChartResponseHeaders(
    attachNewsletterDraftSessionCookie(response, createdSessionId),
    request,
    methods,
  )
}

/**
 * Anonymous local mutations use a cookie-backed scope. Return that identity
 * to the browser before performing the first side effect so a disconnect can
 * never create data under a session the caller did not retain.
 */
export function newsletterChartSessionEstablishmentResponse(
  request: NextRequest,
  methods: NewsletterChartApiMethods,
  ownerId: string | null,
  createdSessionId: string | null,
): NextResponse | null {
  if (ownerId || !createdSessionId) return null

  const response = finalizeNewsletterChartResponse(
    NextResponse.json(
      {
        error: 'Newsletter chart session established. Retry this request with the same Idempotency-Key.',
        code: 'newsletter_chart_session_established',
        retryable: true,
      },
      { status: 428 },
    ),
    request,
    methods,
    createdSessionId,
  )
  response.headers.set('Retry-After', '0')
  response.headers.set('X-Newsletter-Session-Established', 'true')
  return response
}

export function throwIfNewsletterChartRequestAborted(
  request: NextRequest,
  fallback?: unknown,
): void {
  if (!request.signal.aborted) return
  throw request.signal.reason ?? fallback ?? new Error('Newsletter chart request aborted')
}

export async function authorizeNewsletterChartRequest(
  request: NextRequest,
  methods: NewsletterChartApiMethods,
): Promise<NewsletterChartAccessResult> {
  throwIfNewsletterChartRequestAborted(request)

  if (!isAllowedNewsletterChartOrigin(request)) {
    return {
      access: null,
      response: newsletterChartJson(
        request,
        methods,
        { error: 'This origin is not allowed to access newsletter charts' },
        { status: 403 },
      ),
    }
  }

  const access = await resolveNewsletterDraftScope(request)
  throwIfNewsletterChartRequestAborted(request)
  if (process.env.NODE_ENV === 'production' && !access.scope.ownerId) {
    return {
      access: null,
      response: finalizeNewsletterChartResponse(
        NextResponse.json(
          { error: 'Sign in to manage newsletter charts.' },
          { status: 401 },
        ),
        request,
        methods,
        access.createdSessionId,
      ),
    }
  }

  return { access, response: null }
}

export function newsletterChartPreflight(
  request: NextRequest,
  methods: NewsletterChartApiMethods,
): NextResponse {
  if (!isAllowedNewsletterChartOrigin(request)) {
    return newsletterChartJson(
      request,
      methods,
      { error: 'This origin is not allowed to access newsletter charts' },
      { status: 403 },
    )
  }

  return applyNewsletterChartResponseHeaders(
    new NextResponse(null, { status: 204 }),
    request,
    methods,
  )
}

function isJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

export async function readNewsletterChartJson(
  request: NextRequest,
): Promise<unknown> {
  throwIfNewsletterChartRequestAborted(request)
  if (!isJsonMediaType(request.headers.get('content-type'))) {
    throw new NewsletterChartRequestError(
      'Content-Type must be application/json.',
      415,
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_NEWSLETTER_CHART_REQUEST_BYTES
  ) {
    throw new NewsletterChartRequestError(
      'Newsletter chart request body is too large.',
      413,
    )
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new NewsletterChartRequestError(
      'Newsletter chart request body must be valid JSON.',
      400,
    )
  }

  const decoder = new TextDecoder()
  let totalBytes = 0
  let payload = ''
  const cancelReader = () => {
    void reader.cancel(request.signal.reason).catch(() => undefined)
  }
  request.signal.addEventListener('abort', cancelReader, { once: true })
  try {
    while (true) {
      throwIfNewsletterChartRequestAborted(request)
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue

      totalBytes += value.byteLength
      if (totalBytes > MAX_NEWSLETTER_CHART_REQUEST_BYTES) {
        await reader.cancel('Newsletter chart request body is too large.')
          .catch(() => undefined)
        throw new NewsletterChartRequestError(
          'Newsletter chart request body is too large.',
          413,
        )
      }
      payload += decoder.decode(value, { stream: true })
    }
    payload += decoder.decode()
  } finally {
    request.signal.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }

  throwIfNewsletterChartRequestAborted(request)
  try {
    return JSON.parse(payload) as unknown
  } catch (error) {
    throwIfNewsletterChartRequestAborted(request, error)
    throw new NewsletterChartRequestError(
      'Newsletter chart request body must be valid JSON.',
      400,
    )
  }
}

const NEWSLETTER_CHART_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeNewsletterChartId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!NEWSLETTER_CHART_ID_PATTERN.test(id)) {
    throw new NewsletterChartRequestError(
      'Newsletter chart id must be a valid UUID.',
      400,
    )
  }
  return id
}

function isNewsletterChartClientError(error: unknown): boolean {
  if (error instanceof NewsletterCapturePathError) return true
  if (!(error instanceof Error)) return false
  return (
    error.name === 'NewsletterChartLibraryPageInputError' ||
    error.message === 'chartBaseUrl must use a configured charting origin' ||
    error.message === 'Chart title is required' ||
    error.message === 'Chart title must be 120 characters or fewer'
  )
}

export function newsletterChartErrorResponse(
  error: unknown,
  request: NextRequest,
  methods: NewsletterChartApiMethods,
  createdSessionId: string | null = null,
): NextResponse {
  throwIfNewsletterChartRequestAborted(request, error)

  if (error instanceof NewsletterChartPostError) {
    const response = finalizeNewsletterChartResponse(
      NextResponse.json(
        { error: error.message },
        { status: error.status },
      ),
      request,
      methods,
      createdSessionId,
    )
    if (error.retryAfterSeconds !== null) {
      response.headers.set('Retry-After', String(error.retryAfterSeconds))
    }
    return response
  }

  const message =
    error instanceof Error ? error.message : 'Newsletter chart request failed'
  const status = error instanceof NewsletterChartRequestError
    ? error.status
    : error instanceof NewsletterChartLibraryNotFoundError
      ? 404
      : isNewsletterChartClientError(error)
        ? 400
        : 500
  if (status < 500) {
    return finalizeNewsletterChartResponse(
      NextResponse.json({ error: message }, { status }),
      request,
      methods,
      createdSessionId,
    )
  }

  const logMessage = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
  console.error(
    '[newsletter-chart-api] Request failed:',
    logMessage
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, MAX_NEWSLETTER_CHART_SERVER_ERROR_LOG_CHARS),
  )
  return finalizeNewsletterChartResponse(
    NextResponse.json(
      { error: 'Newsletter chart request failed' },
      { status: 500 },
    ),
    request,
    methods,
    createdSessionId,
  )
}
