import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Client-side Supabase client (for use in React components)
// This uses the anon key which is safe to expose in the browser
export function createBrowserClient() {
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
