/** Shared streamed-body ceiling for account and batch-quote watchlist commands. */
export const WATCHLIST_REQUEST_MAX_BYTES = 8 * 1024

/**
 * Browser-stamped account identity. Supabase remains authoritative; this value
 * lets the route reject a request when the cookie principal changed after the
 * UI/controller that issued it was rendered.
 */
export const ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER =
  'X-Intraday-Expected-User-Id'

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isAccountWatchlistUserId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_UUID_PATTERN.test(value)
}
