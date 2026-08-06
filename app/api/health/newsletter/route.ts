export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getNewsletterCronHealthSnapshot } from '@/lib/newsletter/cron-observability'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

export async function GET() {
  const checkedAt = new Date().toISOString()
  try {
    const snapshot = await getNewsletterCronHealthSnapshot(new Date(checkedAt))
    return NextResponse.json(snapshot, {
      status: snapshot.status === 'healthy' ? 200 : 503,
      headers: NO_STORE_HEADERS,
    })
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        checkedAt,
        reason: 'observability_unavailable',
      },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}
