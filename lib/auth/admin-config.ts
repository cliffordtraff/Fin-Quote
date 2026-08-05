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
  // Admin access must fail closed. A missing allowlist is a deployment
  // configuration error, not permission for every signed-in account.
  return allowlist.length > 0 && allowlist.includes(normalizedEmail)
}
