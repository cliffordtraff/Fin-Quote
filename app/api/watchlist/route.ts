export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'
import { createStatelessUserClient } from '@/lib/supabase/stateless-user'
import {
  createAccountWatchlistStore,
  AccountWatchlistStoreError,
} from '@/lib/dashboard/account-watchlist-store'
import {
  MAX_WATCHLIST_SYMBOLS,
  WATCHLIST_SYNC_MODES,
  normalizeWatchlistSymbols,
  type AccountWatchlistSnapshot,
  type AccountWatchlistSyncCommand,
  type AccountWatchlistSyncResult,
} from '@/lib/dashboard/watchlist-contract'
import {
  ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER,
  WATCHLIST_REQUEST_MAX_BYTES,
  isAccountWatchlistUserId,
} from '@/lib/dashboard/watchlist-http-contract'

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const

class AccountWatchlistRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415,
  ) {
    super(message)
    this.name = 'AccountWatchlistRequestError'
  }
}

class AccountWatchlistPrincipalMismatchError extends Error {
  constructor() {
    super('Account watchlist principal mismatch')
    this.name = 'AccountWatchlistPrincipalMismatchError'
  }
}

type AccountWatchlistClient = ReturnType<typeof createStatelessUserClient>

type AccountWatchlistAuthentication =
  | { status: 'authenticated'; client: AccountWatchlistClient }
  | { status: 'authentication_required' }
  | { status: 'authentication_unavailable' }
  | { status: 'principal_mismatch' }

function isFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC === 'true'
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

function expectedUserId(request: Request): string | null {
  const value = request.headers.get(ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER)
  return isAccountWatchlistUserId(value) ? value : null
}

function bearerAccessToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length)
  return isSupabaseAccessToken(token) ? token : null
}

function invalidExpectedPrincipal(): NextResponse {
  return json({
    error: 'The account watchlist principal is invalid.',
    code: 'INVALID_WATCHLIST_PRINCIPAL',
  }, 400)
}

function authorizationRequired(): NextResponse {
  return json({
    error: 'A valid account access token is required.',
    code: 'WATCHLIST_AUTHORIZATION_REQUIRED',
  }, 401)
}

function authenticationFailure(
  operation: 'load' | 'update',
  status: Exclude<AccountWatchlistAuthentication['status'], 'authenticated'>,
): NextResponse {
  if (status === 'authentication_required') {
    return json({
      error: `Sign in to ${operation} your account watchlist.`,
      code: 'AUTH_REQUIRED',
    }, 401)
  }
  if (status === 'principal_mismatch') {
    return json({
      error: 'Your signed-in account changed. Reload before using the account watchlist.',
      code: 'WATCHLIST_PRINCIPAL_MISMATCH',
    }, 409)
  }
  return json({
    error: 'Account authentication is temporarily unavailable.',
    code: 'WATCHLIST_AUTH_UNAVAILABLE',
  }, 503)
}

function throwIfAborted(request: Request, fallback?: unknown): void {
  if (!request.signal.aborted) return
  throw request.signal.reason ?? fallback ?? new DOMException(
    'Account watchlist request aborted.',
    'AbortError',
  )
}

function isSameOriginBrowserRequest(request: Request): boolean {
  const rawOrigin = request.headers.get('origin')?.trim()
  if (!rawOrigin || rawOrigin === 'null') return false

  try {
    const origin = new URL(rawOrigin)
    if (rawOrigin !== origin.origin || origin.origin !== new URL(request.url).origin) {
      return false
    }
  } catch {
    return false
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  return !fetchSite || fetchSite === 'same-origin'
}

function isJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

async function readBoundedJson(request: Request): Promise<unknown> {
  throwIfAborted(request)
  if (!isJsonMediaType(request.headers.get('content-type'))) {
    throw new AccountWatchlistRequestError(
      'Content-Type must be a JSON media type.',
      415,
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength)
    && declaredLength > WATCHLIST_REQUEST_MAX_BYTES
  ) {
    throw new AccountWatchlistRequestError(
      'Account watchlist request body is too large.',
      413,
    )
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new AccountWatchlistRequestError(
      'Account watchlist request body must be valid JSON.',
      400,
    )
  }

  const decoder = new TextDecoder()
  let serialized = ''
  let totalBytes = 0
  const cancelReader = () => {
    void reader.cancel(request.signal.reason).catch(() => undefined)
  }
  request.signal.addEventListener('abort', cancelReader, { once: true })
  try {
    while (true) {
      throwIfAborted(request)
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue

      totalBytes += value.byteLength
      if (totalBytes > WATCHLIST_REQUEST_MAX_BYTES) {
        await reader.cancel('Account watchlist request body is too large.')
          .catch(() => undefined)
        throw new AccountWatchlistRequestError(
          'Account watchlist request body is too large.',
          413,
        )
      }
      serialized += decoder.decode(value, { stream: true })
    }
    serialized += decoder.decode()
  } finally {
    request.signal.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }

  throwIfAborted(request)
  try {
    return JSON.parse(serialized) as unknown
  } catch (error) {
    throwIfAborted(request, error)
    throw new AccountWatchlistRequestError(
      'Account watchlist request body must be valid JSON.',
      400,
    )
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseCommand(
  value: unknown,
  authenticatedExpectedUserId: string,
): AccountWatchlistSyncCommand {
  if (!isPlainRecord(value)) {
    throw new AccountWatchlistRequestError('Invalid account watchlist command.', 400)
  }
  const keys = Object.keys(value).sort()
  if (keys.join(',') !== 'expectedRevision,expectedUserId,idempotencyKey,mode,symbols') {
    throw new AccountWatchlistRequestError('Invalid account watchlist command.', 400)
  }

  const {
    mode,
    symbols,
    expectedRevision,
    expectedUserId: bodyExpectedUserId,
    idempotencyKey,
  } = value
  if (
    typeof mode !== 'string'
    || !WATCHLIST_SYNC_MODES.includes(mode as (typeof WATCHLIST_SYNC_MODES)[number])
    || (
      expectedRevision !== null
      && (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0)
    )
    || typeof idempotencyKey !== 'string'
    || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new AccountWatchlistRequestError('Invalid account watchlist command.', 400)
  }
  if (!isAccountWatchlistUserId(bodyExpectedUserId)) {
    throw new AccountWatchlistRequestError(
      'Invalid account watchlist command.',
      400,
    )
  }
  if (bodyExpectedUserId !== authenticatedExpectedUserId) {
    throw new AccountWatchlistPrincipalMismatchError()
  }

  let canonicalSymbols: string[] | null
  if (symbols === null) {
    canonicalSymbols = null
  } else {
    if (!Array.isArray(symbols) || symbols.length > MAX_WATCHLIST_SYMBOLS) {
      throw new AccountWatchlistRequestError('Invalid account watchlist symbols.', 400)
    }
    canonicalSymbols = normalizeWatchlistSymbols(symbols)
    if (canonicalSymbols.length !== symbols.length) {
      throw new AccountWatchlistRequestError('Invalid account watchlist symbols.', 400)
    }
  }

  return {
    mode: mode as AccountWatchlistSyncCommand['mode'],
    symbols: canonicalSymbols,
    expectedRevision: expectedRevision as number | null,
    idempotencyKey,
  }
}

function serializeSnapshot(snapshot: AccountWatchlistSnapshot) {
  return {
    symbols: snapshot.symbols,
    revision: snapshot.revision,
    syncInitializedAt: snapshot.syncInitializedAt,
  }
}

function serializeSyncResult(result: AccountWatchlistSyncResult) {
  return {
    watchlist: serializeSnapshot(result),
    disposition: result.disposition,
    droppedSymbols: result.droppedSymbols,
  }
}

const REJECTED_ACCESS_TOKEN_CODES = new Set([
  'bad_jwt',
  'no_authorization',
  'session_expired',
  'session_not_found',
  'unexpected_audience',
  'user_banned',
  'user_not_found',
])

function isAuthenticationRequiredError(error: unknown): boolean {
  try {
    if (isAuthSessionMissingError(error)) return true
    return isAuthApiError(error) && (
      error.status === 401
      || error.status === 403
      || (typeof error.code === 'string' && REJECTED_ACCESS_TOKEN_CODES.has(error.code))
    )
  } catch {
    return false
  }
}

async function authenticate(
  request: Request,
  requestedUserId: string,
  accessToken: string,
): Promise<AccountWatchlistAuthentication> {
  try {
    throwIfAborted(request)
    const client = createStatelessUserClient(accessToken, {
      signal: request.signal,
    })
    throwIfAborted(request)
    const result: unknown = await client.auth.getUser(accessToken)
    throwIfAborted(request)

    if (!isPlainRecord(result) || !('data' in result) || !('error' in result)) {
      return { status: 'authentication_unavailable' }
    }
    if (result.error !== null) {
      return {
        status: isAuthenticationRequiredError(result.error)
          ? 'authentication_required'
          : 'authentication_unavailable',
      }
    }
    if (!isPlainRecord(result.data) || !('user' in result.data)) {
      return { status: 'authentication_unavailable' }
    }
    if (result.data.user === null) {
      return { status: 'authentication_required' }
    }
    if (
      !isPlainRecord(result.data.user)
      || !isAccountWatchlistUserId(result.data.user.id)
    ) {
      return { status: 'authentication_unavailable' }
    }
    if (result.data.user.id !== requestedUserId) {
      return { status: 'principal_mismatch' }
    }
    return { status: 'authenticated', client }
  } catch (error) {
    throwIfAborted(request, error)
    return {
      status: isAuthenticationRequiredError(error)
        ? 'authentication_required'
        : 'authentication_unavailable',
    }
  }
}

function logStoreFailure(operation: 'read' | 'sync', error: unknown): void {
  const category = error instanceof AccountWatchlistStoreError
    ? 'store'
    : 'unexpected'
  console.error(`[account-watchlist] ${operation} ${category} failure`)
}

export async function GET(request: Request) {
  if (!isFeatureEnabled()) {
    return json({ error: 'Account watchlist sync is not available.', code: 'WATCHLIST_SYNC_DISABLED' }, 404)
  }

  const requestedUserId = expectedUserId(request)
  if (!requestedUserId) return invalidExpectedPrincipal()
  const accessToken = bearerAccessToken(request)
  if (!accessToken) return authorizationRequired()

  try {
    const authentication = await authenticate(
      request,
      requestedUserId,
      accessToken,
    )
    if (authentication.status !== 'authenticated') {
      return authenticationFailure('load', authentication.status)
    }

    const snapshot = await createAccountWatchlistStore(authentication.client)
      .read(request.signal)
    throwIfAborted(request)
    return json({ watchlist: serializeSnapshot(snapshot) })
  } catch (error) {
    throwIfAborted(request, error)
    logStoreFailure('read', error)
    return json({ error: 'Unable to load the account watchlist.', code: 'WATCHLIST_READ_FAILED' }, 503)
  }
}

export async function PUT(request: Request) {
  if (!isFeatureEnabled()) {
    return json({ error: 'Account watchlist sync is not available.', code: 'WATCHLIST_SYNC_DISABLED' }, 404)
  }
  if (!isSameOriginBrowserRequest(request)) {
    return json({ error: 'This origin is not allowed to update the account watchlist.', code: 'WATCHLIST_ORIGIN_FORBIDDEN' }, 403)
  }

  const requestedUserId = expectedUserId(request)
  if (!requestedUserId) return invalidExpectedPrincipal()
  const accessToken = bearerAccessToken(request)
  if (!accessToken) return authorizationRequired()

  try {
    const authentication = await authenticate(
      request,
      requestedUserId,
      accessToken,
    )
    if (authentication.status !== 'authenticated') {
      return authenticationFailure('update', authentication.status)
    }

    const command = parseCommand(await readBoundedJson(request), requestedUserId)
    throwIfAborted(request)
    const result = await createAccountWatchlistStore(authentication.client).sync(
      command,
      request.signal,
    )
    throwIfAborted(request)

    const body = serializeSyncResult(result)
    if (result.disposition === 'conflict') {
      return json({
        error: 'The account watchlist changed before this command was applied.',
        code: 'WATCHLIST_REVISION_CONFLICT',
        ...body,
      }, 409)
    }
    return json(body)
  } catch (error) {
    throwIfAborted(request, error)
    if (error instanceof AccountWatchlistPrincipalMismatchError) {
      return authenticationFailure('update', 'principal_mismatch')
    }
    if (error instanceof AccountWatchlistRequestError) {
      return json({
        error: error.message,
        code: error.status === 413
          ? 'WATCHLIST_REQUEST_TOO_LARGE'
          : error.status === 415
            ? 'WATCHLIST_MEDIA_TYPE_UNSUPPORTED'
            : 'INVALID_WATCHLIST_COMMAND',
      }, error.status)
    }
    logStoreFailure('sync', error)
    const expectedStoreFailure = error instanceof AccountWatchlistStoreError
    return json({
      error: 'Unable to update the account watchlist.',
      code: expectedStoreFailure
        ? 'WATCHLIST_SYNC_FAILED'
        : 'WATCHLIST_INTERNAL_ERROR',
    }, expectedStoreFailure ? 503 : 500)
  }
}
