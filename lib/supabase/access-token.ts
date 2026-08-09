export const SUPABASE_ACCESS_TOKEN_MAX_LENGTH = 16 * 1024

const JWT_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/**
 * A cheap transport bound only. The Supabase Auth server remains the
 * authority for the signature, expiry, session, and subject.
 */
export function isSupabaseAccessToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 64
    && value.length <= SUPABASE_ACCESS_TOKEN_MAX_LENGTH
    && JWT_PATTERN.test(value)
}
