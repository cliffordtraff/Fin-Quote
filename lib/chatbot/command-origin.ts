import 'server-only'

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
} as const

const FORBIDDEN_BROWSER_SITES = new Set(['same-site', 'cross-site'])

function forbiddenResponse(): Response {
  return Response.json(
    { error: 'Cross-site chatbot commands are not allowed.' },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
  )
}

/**
 * Preserve the exact-origin protection normally supplied by Server Actions.
 * Headerless requests remain available to trusted server/test callers, while
 * browser requests from sibling subdomains are rejected before auth or body
 * parsing can begin.
 */
export function chatbotCommandOriginResponse(request: Request): Response | null {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (fetchSite && FORBIDDEN_BROWSER_SITES.has(fetchSite)) {
    return forbiddenResponse()
  }

  const rawOrigin = request.headers.get('origin')
  if (rawOrigin === null) return null

  const exactOrigin = rawOrigin.trim()
  try {
    const parsedOrigin = new URL(exactOrigin)
    if (
      exactOrigin !== parsedOrigin.origin ||
      parsedOrigin.origin !== new URL(request.url).origin
    ) {
      return forbiddenResponse()
    }
  } catch {
    return forbiddenResponse()
  }

  return null
}
