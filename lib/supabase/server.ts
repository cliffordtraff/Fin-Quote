import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Server-side Supabase client (for use in Server Actions, API Routes, Server Components)
// This is cached per request to avoid recreating the client multiple times
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Since you're using Firebase Auth separately
    },
  })
}
