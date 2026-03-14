export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import { getCompanyProfile } from '@/app/actions/get-company-profile'

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const normalized = decodeURIComponent(symbol).toUpperCase()

  if (!/^[A-Z]{1,5}(=[A-Z])?$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  const now = Date.now()
  const cached = cache.get(normalized)
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'HIT',
      },
    })
  }

  const provider = getProvider()
  const [newsResult, profileResult] = await Promise.allSettled([
    provider.getNews(normalized, 3),
    getCompanyProfile(normalized),
  ])

  const data = {
    news: newsResult.status === 'fulfilled'
      ? newsResult.value.map((item) => ({
          title: item.title,
          publishedDate: item.publishedDate,
          site: item.site,
          url: item.url,
        }))
      : [],
    profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
  }

  cache.set(normalized, { at: now, data })

  if (cache.size > 32) {
    for (const [key, entry] of cache) {
      if (now - entry.at > TTL_MS * 2) cache.delete(key)
    }
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-Cache': 'MISS',
    },
  })
}
