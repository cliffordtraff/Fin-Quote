import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

// Server-side Supabase client (for use in Server Actions, API Routes, Server Components)
// This properly handles auth sessions via cookies
export function createServerClient() {
  return createServerComponentClient<Database>({ cookies })
}
