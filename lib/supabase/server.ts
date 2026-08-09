import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'
import {
  resolveRequestSession,
  SUPABASE_SESSION_EXPIRY_SKEW_SECONDS,
  supabaseSessionStorageKey,
  type RequestSessionResolution,
} from '@/lib/supabase/request-session'
import {
  verifyStatelessUser,
  type VerifiedUserClient,
} from '@/lib/supabase/verify-user'

export type AuthenticatedRequestClient = VerifiedUserClient

export interface AuthenticatedRequestContext {
  accessToken: string
  client: AuthenticatedRequestClient
  expiresAt: number
  user: User
}

export interface AuthenticatedRequestOptions {
  signal?: AbortSignal
  minimumValiditySeconds?: number
}

export type RequestAuthenticationReason =
  | 'missing'
  | 'malformed'
  | 'expired'
  | 'expiring'
  | 'invalid'

export class RequestAuthenticationRequiredError extends Error {
  constructor(
    public readonly reason: RequestAuthenticationReason,
    public readonly expiresAt?: number,
  ) {
    super('A current authenticated session is required.')
    this.name = 'RequestAuthenticationRequiredError'
  }
}

export class RequestAuthenticationUnavailableError extends Error {
  constructor() {
    super('Authentication is temporarily unavailable.')
    this.name = 'RequestAuthenticationUnavailableError'
  }
}

function authenticationReason(
  resolution: Exclude<RequestSessionResolution, { status: 'ready' }>,
): RequestAuthenticationReason {
  return resolution.status
}

export async function resolveAuthenticatedRequest(
  options: AuthenticatedRequestOptions = {},
): Promise<AuthenticatedRequestContext> {
  let cookieValues: Array<{ name: string; value: string }>
  try {
    const cookieStore = await cookies()
    cookieValues = cookieStore.getAll().map(cookie => ({
      name: cookie.name,
      value: cookie.value,
    }))
  } catch {
    throw new RequestAuthenticationUnavailableError()
  }

  return resolveAuthenticatedCookieValues(cookieValues, options)
}

export async function resolveAuthenticatedCookieValues(
  cookieValues: readonly { name: string; value: string }[],
  options: AuthenticatedRequestOptions = {},
): Promise<AuthenticatedRequestContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) throw new RequestAuthenticationUnavailableError()

  try {
    supabaseSessionStorageKey(url)
  } catch {
    throw new RequestAuthenticationUnavailableError()
  }

  const requestedMinimum = options.minimumValiditySeconds
    ?? SUPABASE_SESSION_EXPIRY_SKEW_SECONDS
  if (
    !Number.isSafeInteger(requestedMinimum)
    || requestedMinimum < 0
    || requestedMinimum > 3_600
  ) {
    throw new RequestAuthenticationUnavailableError()
  }
  const minimumValiditySeconds = Math.max(
    requestedMinimum,
    SUPABASE_SESSION_EXPIRY_SKEW_SECONDS,
  )

  const session = resolveRequestSession(cookieValues, url)
  if (session.status !== 'ready') {
    throw new RequestAuthenticationRequiredError(
      authenticationReason(session),
      session.status === 'expired' ? session.expiresAt : undefined,
    )
  }
  if (
    session.expiresAt
    <= Math.floor(Date.now() / 1_000) + minimumValiditySeconds
  ) {
    throw new RequestAuthenticationRequiredError('expiring', session.expiresAt)
  }

  try {
    const verification = await verifyStatelessUser(session.accessToken, {
      signal: options.signal,
    })
    if (verification.status === 'invalid') {
      throw new RequestAuthenticationRequiredError('invalid', session.expiresAt)
    }
    if (verification.status === 'unavailable') {
      throw new RequestAuthenticationUnavailableError()
    }
    return {
      accessToken: session.accessToken,
      client: verification.client,
      expiresAt: session.expiresAt,
      user: verification.user,
    }
  } catch (error) {
    if (
      error instanceof RequestAuthenticationRequiredError
      || error instanceof RequestAuthenticationUnavailableError
    ) throw error
    if (options.signal?.aborted) throw error
    throw new RequestAuthenticationUnavailableError()
  }
}

// Server-side Supabase client (for use in Server Actions, API Routes, Server Components)
// Uses @supabase/ssr for cookie-based session management with cross-subdomain support
export { createClient as createServerClient }
export async function createClient(options: { signal?: AbortSignal } = {}) {
  const cookieStore = await cookies()
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined
  const signalBoundFetch: typeof fetch = (input, init = {}) => {
    const requestSignal = init.signal ?? (
      input instanceof Request ? input.signal : undefined
    )
    const signal = options.signal && requestSignal
      ? AbortSignal.any([options.signal, requestSignal])
      : options.signal ?? requestSignal

    return fetch(input, { ...init, signal })
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(options.signal ? { global: { fetch: signalBoundFetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                domain: cookieDomain,
              })
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
