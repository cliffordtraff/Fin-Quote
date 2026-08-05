import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdminUserEmail } from '@/lib/auth/admin-config'
import { isBlockedCrawlerUserAgent, isStaticOrMetadataPath } from '@/lib/request-policy'

// Routes that require authentication
const PROTECTED_ROUTES = ['/profile', '/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always let crawlers read the policy that applies to them.
  if (pathname === '/robots.txt') {
    return NextResponse.next()
  }

  // Bytespider was responsible for repeated bursts across expensive routes.
  // Stop it before a page or API function runs.
  if (isBlockedCrawlerUserAgent(req.headers.get('user-agent'))) {
    return new NextResponse(null, {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }

  // Ignore Next internals + API routes + static files for normal traffic.
  if (isStaticOrMetadataPath(pathname)) {
    return NextResponse.next()
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
    'dashboard',
    'stock',
    'stock-v1',
    'company',
    'charts',
    'charts-experiment',
    'charts-experiment-2',
    'concept',
    'calendar',
    'insiders',
    'chatbot',
    'login',
    'logout',
    'auth',
    'profile',
    'admin',
    'pricing',
    'newsletter',
    'workspace',
    'multi-charts',
    'robots.txt',
    'sitemap.xml',
    'manifest.webmanifest',
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

  // Public pages do not need an authenticated Supabase round trip. Session
  // validation still happens before access to protected routes.
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined
  let supabaseResponse = NextResponse.next({ request: req })

  if (!supabaseUrl || !supabaseAnonKey) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              domain: cookieDomain,
            })
          )
        },
      },
    }
  )

  let user = null
  try {
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser()
    user = resolvedUser
  } catch {
    user = null
  }

  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/admin') && !isAdminUserEmail(user.email)) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: '/:path*',
}
