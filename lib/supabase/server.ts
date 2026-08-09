import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

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
