const SENSITIVE_QUERY_VALUE =
  /([?&](?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|key)=)[^&\s"'<>]+/gi
const AUTHORIZATION_VALUE =
  /(\bauthorization\b["']?\s*[:=]\s*["']?(?:bearer|basic)\s+)[^"',}\s]+/gi
const SECRET_ASSIGNMENT =
  /(\b(?:FMP|MASSIVE|OPENAI|SUPABASE|TAVILY|EXA)_[A-Z0-9_]*(?:KEY|TOKEN)\s*=\s*)[^\s,;]+/gi

export function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_VALUE, '$1[REDACTED]')
    .replace(AUTHORIZATION_VALUE, '$1[REDACTED]')
    .replace(SECRET_ASSIGNMENT, '$1[REDACTED]')
}

export function safeErrorMessage(
  error: unknown,
  fallback = 'Unknown error',
): string {
  if (error instanceof Error) {
    return redactSensitiveText(error.message || fallback)
  }

  if (typeof error === 'string') {
    return redactSensitiveText(error)
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return redactSensitiveText(error.message)
  }

  return fallback
}
