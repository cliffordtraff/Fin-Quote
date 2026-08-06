export interface SupabaseServiceRoleCredentials {
  url: string
  serviceRoleKey: string
}

/**
 * Resolve credentials for scripts that mutate server-owned Supabase data.
 *
 * These scripts must never fall back to the browser-safe anonymous key: RLS
 * intentionally denies that role write access to ingestion and reference data.
 */
export function requireSupabaseServiceRoleCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseServiceRoleCredentials {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  return { url, serviceRoleKey }
}
