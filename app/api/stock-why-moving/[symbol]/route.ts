export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getStockWhyMovingDisplayData } from '@/lib/stock-why-moving-display'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const normalized = decodeURIComponent((await params).symbol).trim().toUpperCase()

  if (!/^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  const data = await getStockWhyMovingDisplayData(normalized)

  return NextResponse.json(data, {
    status: data.status === 'error' ? 502 : 200,
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=900',
    },
  })
}
