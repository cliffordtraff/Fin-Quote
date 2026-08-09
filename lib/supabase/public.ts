import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

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

/** Cookie-free Supabase client for data that is intentionally public. */
export function createPublicDatabaseClient(
  options: { signal?: AbortSignal } = {},
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) throw new Error('Missing public Supabase configuration')

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    ...(options.signal
      ? { global: { fetch: signalBoundFetch(options.signal) } }
      : {}),
  })
}

// Short alias retained for existing public-data loaders.
export const createPublicClient = createPublicDatabaseClient
