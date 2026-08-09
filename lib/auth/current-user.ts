import {
  isAuthSessionMissingError,
  type User,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export class AuthenticationRequiredError extends Error {
  constructor(message = 'You must be signed in to continue.') {
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
  options: { signal?: AbortSignal } = {},
): Promise<User> {
  const supabase = await createClient({ signal: options.signal })
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>
  try {
    result = await supabase.auth.getUser()
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new AuthenticationUnavailableError()
  }

  const { data: { user }, error } = result
  if (error) {
    if (isAuthSessionMissingError(error)) throw new AuthenticationRequiredError()
    throw new AuthenticationUnavailableError()
  }

  if (!user) {
    throw new AuthenticationRequiredError()
  }
  return user
}
