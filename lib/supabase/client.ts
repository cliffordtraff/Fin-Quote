import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'

// Client-side Supabase client (for use in React components)
// Uses @supabase/ssr for cookie-based session management
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      domain: cookieDomain,
      path: '/',
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    },
  })
}
