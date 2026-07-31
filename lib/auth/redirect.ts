const AUTH_REDIRECT_ORIGIN = 'https://theintraday.local'

export function resolveAuthRedirect(
  value: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback
  }

  try {
    const url = new URL(value, AUTH_REDIRECT_ORIGIN)
    if (url.origin !== AUTH_REDIRECT_ORIGIN) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
