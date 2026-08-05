/** Return a normalized public web URL, rejecting executable and credential URLs. */
export function normalizeExternalHttpUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}
