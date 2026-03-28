export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import {
  loadDashboardChartOfTheDayFallbackImage,
  resolveCurrentDashboardChartOfTheDay,
  transformDashboardChartImageForDarkTheme,
} from '@/lib/dashboard/chart-of-the-day'
import { getDashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'

export async function GET(request: NextRequest) {
  const theme = request.nextUrl.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const setting = await getDashboardChartOfTheDaySetting()

  try {
    const resolvedChart = await resolveCurrentDashboardChartOfTheDay({
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

    if (theme === 'dark' && (response.headers.get('content-type') || '').includes('image/png')) {
      const rawBuffer = Buffer.from(await response.arrayBuffer())
      const themedBuffer = await transformDashboardChartImageForDarkTheme(rawBuffer)
      const body = new Blob([Uint8Array.from(themedBuffer)], {
        type: 'image/png',
      })

      return new Response(body, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'image/png',
        },
      })
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': response.headers.get('content-type') || 'image/png',
      },
    })
  } catch (error) {
    const fallbackImage =
      setting.source === 'template' && setting.selection
        ? await loadDashboardChartOfTheDayFallbackImage(theme, setting.selection)
        : null
    if (fallbackImage) {
      const body = new Blob([Uint8Array.from(fallbackImage.buffer)], {
        type: fallbackImage.contentType,
      })

      return new Response(body, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': fallbackImage.contentType,
        },
      })
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
