function parseAdminEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function getAdminEmailAllowlist(): string[] {
  return parseAdminEmails(process.env.ADMIN_EMAILS)
}

export function isAdminAllowlistConfigured(): boolean {
  return getAdminEmailAllowlist().length > 0
}

export function isAdminUserEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return false

  const allowlist = getAdminEmailAllowlist()
  if (allowlist.length === 0) {
    // Backward-compatible fallback: existing admin routes were auth-only.
    return true
  }

  return allowlist.includes(normalizedEmail)
}
