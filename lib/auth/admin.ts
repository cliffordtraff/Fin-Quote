import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAdminAllowlistConfigured, isAdminUserEmail } from './admin-config'

export class AdminAccessError extends Error {
  constructor(message = 'You do not have access to this admin feature.') {
    super(message)
    this.name = 'AdminAccessError'
  }
}

export async function getCurrentUserAdminContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    user,
    isAdmin: isAdminUserEmail(user?.email),
    adminConfigured: isAdminAllowlistConfigured(),
  }
}

export async function requireAdminUser(): Promise<{
  user: User
  isAdmin: true
  adminConfigured: boolean
}> {
  const context = await getCurrentUserAdminContext()

  if (!context.user) {
    throw new AdminAccessError('You must be signed in to access this admin feature.')
  }

  if (!context.isAdmin) {
    throw new AdminAccessError()
  }

  return {
    user: context.user,
    isAdmin: true,
    adminConfigured: context.adminConfigured,
  }
}
