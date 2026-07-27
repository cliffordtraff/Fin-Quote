import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

/**
 * Anonymous client for public market-data reads.
 *
 * Unlike the authenticated server client, this does not inspect request
 * cookies. That keeps public pages eligible for ISR and CDN caching.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
