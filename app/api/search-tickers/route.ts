const RETIRED_ROUTE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

export function GET() {
  return Response.json(
    {
      error: 'Gone',
      message: 'This ticker-search endpoint has been retired.',
      replacement: '/api/search-stocks',
    },
    {
      status: 410,
      headers: RETIRED_ROUTE_HEADERS,
    },
  )
}
