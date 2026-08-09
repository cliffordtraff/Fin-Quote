export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getNewsletterAutomationClock } from '@/lib/newsletter/automation-clock'
import { getDashboardCommentaryReadiness } from '@/lib/refresh-dashboard-commentary'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

function isCommentaryDue(clock: {
  isTradingDay: boolean
  hour: number
  minute: number
}): boolean {
  return (
    clock.isTradingDay &&
    // The final 10:29 ET recovery request has a four-minute execution budget.
    // Do not page while that bounded attempt can still be completing.
    (clock.hour > 10 || (clock.hour === 10 && clock.minute >= 35))
  )
}

export async function GET() {
  const clock = getNewsletterAutomationClock()
  if (!isCommentaryDue(clock)) {
    return NextResponse.json(
      {
        status: 'healthy',
        state: 'not_due',
        marketDate: clock.marketDate,
      },
      { headers: NO_STORE_HEADERS },
    )
  }

  try {
    const readiness = await getDashboardCommentaryReadiness(clock.marketDate)
    const components = {
      marketSummary: readiness.marketSummary.ready,
      marketTrends: readiness.marketTrends.ready,
      calendar: readiness.calendar.ready,
    }
    const complete = Object.values(components).every(Boolean)
    return NextResponse.json(
      {
        status: complete ? 'healthy' : 'unhealthy',
        state: complete ? 'current' : 'incomplete',
        marketDate: clock.marketDate,
        components,
      },
      {
        status: complete ? 200 : 503,
        headers: NO_STORE_HEADERS,
      },
    )
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        state: 'observability_unavailable',
        marketDate: clock.marketDate,
      },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}
