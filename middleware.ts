import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routing helpers:
// - Prevent old/dead routes from 404ing (e.g. /market3)
// - Allow short ticker URLs like /AAPL → /stock/AAPL
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Ignore Next internals + API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Legacy route: /market3 → /market
  if (pathname === '/market3' || pathname === '/market3/') {
    const url = req.nextUrl.clone()
    url.pathname = '/market'
    return NextResponse.redirect(url)
  }

  // Consolidate: /company/:symbol → /stock/:symbol
  if (pathname.startsWith('/company/')) {
    const sym = pathname.split('/')[2]
    if (sym) {
      const url = req.nextUrl.clone()
      url.pathname = `/stock/${encodeURIComponent(sym.toUpperCase())}`
      return NextResponse.redirect(url)
    }
  }

  // Convenience: /AAPL → /stock/AAPL
  // Only for single-segment paths that look like tickers.
  // Exclude known top-level routes.
  const topLevelReserved = new Set([
    '',
    'market',
    'market2',
    'market-sunday',
    'market-dexter',
    'stock',
    'company',
    'charts',
    'concept',
    'calendar',
    'insiders',
    'chatbot',
    'login',
    'logout',
  ])

  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 1) {
    const seg = parts[0]
    if (!topLevelReserved.has(seg)) {
      // Basic ticker pattern: letters + optional dot (BRK.B)
      if (/^[A-Za-z]{1,10}(\.[A-Za-z]{1,4})?$/.test(seg)) {
        const url = req.nextUrl.clone()
        url.pathname = `/stock/${encodeURIComponent(seg.toUpperCase())}`
        return NextResponse.redirect(url)
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
