const STATIC_OR_METADATA_FILE = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|css|js|map|woff|woff2|txt|xml|json|webmanifest)$/i
const BLOCKED_CRAWLER_USER_AGENTS = ['bytespider']

export function isStaticOrMetadataPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/tos') ||
    pathname.startsWith('/api') ||
    STATIC_OR_METADATA_FILE.test(pathname)
  )
}

export function isBlockedCrawlerUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false
  const normalized = userAgent.toLowerCase()
  return BLOCKED_CRAWLER_USER_AGENTS.some((token) => normalized.includes(token))
}
