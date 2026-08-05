/**
 * Return the FMP credential supplied by the caller.
 *
 * Scripts must never carry a fallback credential: a missing or whitespace-only
 * value is a configuration error and should stop the process before any
 * network or database work begins.
 */
export function requireFmpApiKey() {
  const apiKey = process.env.FMP_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('FMP_API_KEY environment variable is required')
  }

  return apiKey
}
