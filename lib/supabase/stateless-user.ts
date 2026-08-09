import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'

export const STATELESS_AUTH_RESPONSE_MAX_BYTES = 128 * 1024

export interface StatelessUserClientOptions {
  signal?: AbortSignal
}

export interface StatelessUserUpdateResult {
  status: number
  body: unknown
}

function environment(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Missing public Supabase configuration')
  }
  return { url, anonKey }
}

function signalBoundFetch(ownedSignal?: AbortSignal): typeof fetch {
  return (input, init = {}) => {
    const requestSignal = init.signal ?? (
      input instanceof Request ? input.signal : undefined
    )
    const signal = ownedSignal && requestSignal
      ? AbortSignal.any([ownedSignal, requestSignal])
      : ownedSignal ?? requestSignal
    return fetch(input, { ...init, signal })
  }
}

/**
 * Builds a cookie-free user client around one explicit JWT. Calling
 * `auth.getUser(accessToken)` verifies that JWT without loading or refreshing
 * an SSR session. The same Authorization header also binds PostgREST/RPC work
 * to that exact principal.
 */
export function createStatelessUserClient(
  accessToken: string,
  options: StatelessUserClientOptions = {},
) {
  if (!isSupabaseAccessToken(accessToken)) {
    throw new Error('Invalid Supabase access token transport')
  }
  const { url, anonKey } = environment()
  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: signalBoundFetch(options.signal),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const rawLength = response.headers.get('content-length')
  if (rawLength !== null) {
    const length = Number(rawLength)
    if (!Number.isFinite(length) || length < 0 || length > STATELESS_AUTH_RESPONSE_MAX_BYTES) {
      await response.body?.cancel('Supabase Auth response exceeded its bound.')
        .catch(() => undefined)
      throw new Error('Supabase Auth response exceeded its bound')
    }
  }

  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      total += value.byteLength
      if (total > STATELESS_AUTH_RESPONSE_MAX_BYTES) {
        await reader.cancel('Supabase Auth response exceeded its bound.')
          .catch(() => undefined)
        throw new Error('Supabase Auth response exceeded its bound')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) return null

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

/**
 * Mirrors the authenticated GoTrue `PUT /user` operation without attaching a
 * mutable session store. This preserves normal user-level password policy
 * while ensuring a delayed response cannot emit stale auth cookies.
 */
export async function updateStatelessUser(
  accessToken: string,
  attributes: { data: { display_name: string } } | { password: string },
  options: StatelessUserClientOptions = {},
): Promise<StatelessUserUpdateResult> {
  if (!isSupabaseAccessToken(accessToken)) {
    throw new Error('Invalid Supabase access token transport')
  }
  const { url, anonKey } = environment()
  const response = await signalBoundFetch(options.signal)(
    new URL('/auth/v1/user', url),
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(attributes),
      signal: options.signal,
    },
  )
  let body: unknown = null
  try {
    body = await readBoundedJson(response)
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? error
    throw error
  }
  return { status: response.status, body }
}
