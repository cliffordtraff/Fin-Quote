import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveAuthRedirect } from '@/lib/auth/redirect'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = resolveAuthRedirect(requestUrl.searchParams.get('redirect'))

  if (code) {
    const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined
    const redirectResponse = NextResponse.redirect(
      new URL(redirectTo, requestUrl.origin),
    )

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, {
                ...options,
                domain: cookieDomain,
              })
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] Code exchange failed:', error.message)
      const authUrl = new URL('/auth', requestUrl.origin)
      authUrl.searchParams.set('error', error.message)
      authUrl.searchParams.set('redirect', redirectTo)
      return NextResponse.redirect(authUrl)
    }

    return redirectResponse
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
}
