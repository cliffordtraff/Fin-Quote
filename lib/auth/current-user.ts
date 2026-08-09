import type { User } from '@supabase/supabase-js'
import {
  RequestAuthenticationRequiredError,
  RequestAuthenticationUnavailableError,
  resolveAuthenticatedRequest,
  type AuthenticatedRequestContext,
  type AuthenticatedRequestOptions,
  type RequestAuthenticationReason,
} from '@/lib/supabase/server'

export class AuthenticationRequiredError extends Error {
  constructor(
    message = 'You must be signed in to continue.',
    public readonly reason: RequestAuthenticationReason = 'missing',
    public readonly expiresAt?: number,
  ) {
    super(message)
    this.name = 'AuthenticationRequiredError'
  }
}

export class AuthenticationUnavailableError extends Error {
  constructor(message = 'Authentication is temporarily unavailable.') {
    super(message)
    this.name = 'AuthenticationUnavailableError'
  }
}

export async function requireCurrentUser(
  options: AuthenticatedRequestOptions = {},
): Promise<User> {
  try {
    return (await resolveAuthenticatedRequest(options)).user
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (error instanceof RequestAuthenticationRequiredError) {
      throw new AuthenticationRequiredError(
        undefined,
        error.reason,
        error.expiresAt,
      )
    }
    if (error instanceof RequestAuthenticationUnavailableError) {
      throw new AuthenticationUnavailableError()
    }
    throw new AuthenticationUnavailableError()
  }
}

export async function requireCurrentUserContext(
  options: AuthenticatedRequestOptions = {},
): Promise<AuthenticatedRequestContext> {
  try {
    return await resolveAuthenticatedRequest(options)
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (error instanceof RequestAuthenticationRequiredError) {
      throw new AuthenticationRequiredError(
        undefined,
        error.reason,
        error.expiresAt,
      )
    }
    throw new AuthenticationUnavailableError()
  }
}
