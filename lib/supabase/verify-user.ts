import {
  isAuthError,
  isAuthSessionMissingError,
  type User,
} from '@supabase/supabase-js'
import {
  createStatelessUserClient,
} from '@/lib/supabase/stateless-user'

export type VerifiedUserClient = ReturnType<typeof createStatelessUserClient>

export type StatelessUserVerification =
  | { status: 'authenticated'; client: VerifiedUserClient; user: User }
  | { status: 'invalid' }
  | { status: 'unavailable' }

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Authentication was aborted.', 'AbortError')
}

function awaitWithSignal<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise)
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      value => {
        cleanup()
        resolve(value)
      },
      error => {
        cleanup()
        reject(error)
      },
    )
  })
}

export function isRejectedSupabaseCredential(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  if (!isAuthError(error)) return false
  const status = 'status' in error ? error.status : undefined
  return status === 400 || status === 401 || status === 403
}

export async function verifyStatelessUser(
  accessToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<StatelessUserVerification> {
  let client: VerifiedUserClient
  try {
    client = createStatelessUserClient(accessToken, { signal: options.signal })
  } catch {
    return { status: 'unavailable' }
  }

  try {
    const result = await awaitWithSignal(
      client.auth.getUser(accessToken),
      options.signal,
    )
    if (result.error) {
      return isRejectedSupabaseCredential(result.error)
        ? { status: 'invalid' }
        : { status: 'unavailable' }
    }
    return result.data.user
      ? { status: 'authenticated', client, user: result.data.user }
      : { status: 'invalid' }
  } catch (error) {
    if (options.signal?.aborted) throw error
    return isRejectedSupabaseCredential(error)
      ? { status: 'invalid' }
      : { status: 'unavailable' }
  }
}
