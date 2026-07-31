import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export class AuthenticationRequiredError extends Error {
  constructor(message = 'You must be signed in to continue.') {
    super(message)
    this.name = 'AuthenticationRequiredError'
  }
}

export async function requireCurrentUser(): Promise<User> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new AuthenticationRequiredError()
  }
  return user
}
