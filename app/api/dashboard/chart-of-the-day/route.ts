export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { resolveDashboardChartOfTheDay } from '@/lib/dashboard/chart-of-the-day'
import { getChartingPlatformRenderUrl } from '@/lib/newsletter/capture'
import { getDefaultChartingBaseUrlForHost } from '@/lib/newsletter/charting-platform-export'

const RENDER_TIMEOUT_MS = 30000

function normalizeTheme(value: string | null): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light'
}

async function getRenderErrorDetail(response: Response): Promise<string> {
  let detail = `${response.status} ${response.statusText}`.trim()

  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const payload = await response.json() as { error?: string }
      if (typeof payload.error === 'string' && payload.error.trim()) {
        detail = payload.error.trim()
      }
    } else {
      const text = (await response.text()).trim()
      if (text) detail = text
    }
  } catch (_error) {}

  return detail
}

export async function GET(request: NextRequest) {
  try {
    const theme = normalizeTheme(request.nextUrl.searchParams.get('theme'))
    const host = request.headers.get('host')
    const chartBaseUrl = getDefaultChartingBaseUrlForHost(host)
    const renderUrl = getChartingPlatformRenderUrl(chartBaseUrl)
    const { captureSpec } = resolveDashboardChartOfTheDay({
      chartBaseUrl,
      theme,
    })

    const response = await fetch(renderUrl, {
      method: 'POST',
      headers: {
        Accept: 'image/png',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spec: captureSpec,
        timeoutMs: RENDER_TIMEOUT_MS,
      }),
    })

    if (!response.ok) {
      const detail = await getRenderErrorDetail(response)
      return new Response(`Chart render failed: ${detail}`, {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    const pngBytes = await response.arrayBuffer()
    if (pngBytes.byteLength === 0) {
      return new Response('Chart render returned an empty PNG response', {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    return new Response(pngBytes, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
        'Content-Type': 'image/png',
      },
    })
  } catch (error) {
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
