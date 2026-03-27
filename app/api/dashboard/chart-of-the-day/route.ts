export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardChartOfTheDay } from '@/lib/dashboard/chart-of-the-day'

export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get('format')
    const resolvedChart = resolveDashboardChartOfTheDay({
      baseUrl: request.nextUrl.origin,
    })
    const exportUrl = new URL(resolvedChart.exportUrl)

    if (format === 'embed') {
      exportUrl.searchParams.set('embed', 'true')
    }

    return NextResponse.redirect(exportUrl, { status: 307 })
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
