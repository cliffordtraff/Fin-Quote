import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require authentication
const PROTECTED_ROUTES = ['/profile', '/admin']

// Routes that should redirect to home if already authenticated
const AUTH_ROUTES = ['/auth', '/auth/forgot-password']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Ignore Next internals + API routes + static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next()
  }

  // Create response and supabase client
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if needed (required for auth to work properly)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Check if route requires authentication
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route))

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !session) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages (optional - can be commented out if you want to allow access)
  // if (isAuthRoute && session && !pathname.includes('reset-password')) {
  //   const url = req.nextUrl.clone()
  //   url.pathname = '/'
  //   return NextResponse.redirect(url)
  // }

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
    'auth',
    'profile',
    'admin',
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

  return res
}

export const config = {
  matcher: '/:path*',
}
