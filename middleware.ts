import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdminAllowlistConfigured, isAdminUserEmail } from '@/lib/auth/admin-config'

// Routes that require authentication
const PROTECTED_ROUTES = ['/profile', '/admin']

// Routes that should redirect to home if already authenticated
const AUTH_ROUTES = ['/auth', '/auth/forgot-password']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPublicChartOfDayAdminRoute =
    pathname === '/admin/chart-of-the-day' ||
    pathname.startsWith('/admin/chart-of-the-day/')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Ignore Next internals + API routes + static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/tos') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next()
  }

  // Create response and supabase client using @supabase/ssr
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined
  let supabaseResponse = NextResponse.next({ request: req })
  let user = null

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
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

  // Refresh session if needed (use getUser for security — validates with Supabase Auth server)
  try {
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser()
    user = resolvedUser
  } catch {
    user = null
  }

  // Check if route requires authentication
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route))

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !user && !isPublicChartOfDayAdminRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (
    pathname.startsWith('/admin') &&
    !isPublicChartOfDayAdminRoute &&
    user &&
    isAdminAllowlistConfigured() &&
    !isAdminUserEmail(user.email)
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages (optional - can be commented out if you want to allow access)
  // if (isAuthRoute && user && !pathname.includes('reset-password')) {
  //   const url = req.nextUrl.clone()
  //   url.pathname = '/'
  //   return NextResponse.redirect(url)
  // }

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

  return supabaseResponse
}

export const config = {
  matcher: '/:path*',
}
