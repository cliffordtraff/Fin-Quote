export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import {
  findDashboardChartOfTheDayFallbackImage,
  resolveDashboardChartOfTheDay,
} from '@/lib/dashboard/chart-of-the-day'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const theme = request.nextUrl.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
    const resolvedChart = resolveDashboardChartOfTheDay({
      hostHeader: request.headers.get('host'),
      theme,
    })
    const response = await fetch(resolvedChart.renderUrl, {
      method: 'POST',
      headers: {
        Accept: 'image/png',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spec: resolvedChart.captureSpec,
        timeoutMs: 30000,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`.trim()
      try {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const payload = await response.json() as { error?: string }
          if (payload?.error?.trim()) {
            detail = payload.error.trim()
          }
        } else {
          const text = (await response.text()).trim()
          if (text) detail = text
        }
      } catch {}

      throw new Error(`Chart render failed: ${detail}`)
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': response.headers.get('content-type') || 'image/png',
      },
    })
  } catch (error) {
    const fallbackImage = findDashboardChartOfTheDayFallbackImage()
    if (fallbackImage) {
      return NextResponse.redirect(
        new URL(fallbackImage.publicUrl, request.nextUrl.origin),
        { status: 307 },
      )
    }

    const message =
      error instanceof Error ? error.message : 'Chart render failed'

    return new Response(message, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  }
}
