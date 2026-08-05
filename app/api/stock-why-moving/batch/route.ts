export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getCachedStockWhyMovingDisplayData,
  getStockWhyMovingDisplayData,
} from '@/lib/stock-why-moving-display'
import { isFreshWhyMovingResult } from '@/lib/stock-why-moving'
import { getProvider, type ProviderNews } from '@/lib/providers'

// The dashboard requests one expanded mover at a time. Keeping the public
// endpoint aligned with that UI prevents a single anonymous request from
// fanning out into dozens of live scrape attempts.
const MAX_SYMBOLS = 1
const MAX_REASON_LOOKUP_CONCURRENCY = 1
const MAX_REQUEST_BYTES = 2_048
const MAX_REASON_AGE_MS = 3 * 24 * 60 * 60 * 1000
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,9}$/

type BatchReason = {
  symbol: string
  status: 'found' | 'not_found' | 'error'
  reason: string | null
  sourceUrl: string | null
}

function normalizeReasonText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const sentence = normalized.match(/^.+?[.!?](?:\s|$)/)?.[0]?.trim()
  return sentence || normalized
}

function isFreshTimestamp(
  value: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!value) return false

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false

  return (
    timestamp <= now + FUTURE_TIMESTAMP_TOLERANCE_MS &&
    now - timestamp <= MAX_REASON_AGE_MS
  )
}

function findFreshNewsReason(news: ProviderNews[]): {
  reason: string | null
  sourceUrl: string | null
} {
  const article = news.find((item) => isFreshTimestamp(item.publishedDate))
  if (!article) {
    return { reason: null, sourceUrl: null }
  }

  const title = normalizeReasonText(article.title)
  if (!title) {
    return { reason: null, sourceUrl: null }
  }

  return {
    reason: title,
    sourceUrl: article.url || null,
  }
}

async function getRecentNewsReason(symbol: string): Promise<{
  reason: string | null
  sourceUrl: string | null
}> {
  try {
    const provider = getProvider()
    const news = await provider.getNews(symbol, 5)
    return findFreshNewsReason(news)
  } catch {
    return { reason: null, sourceUrl: null }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(items[currentIndex])
      }
    }),
  )

  return results
}

function normalizeSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const symbol = item.trim().toUpperCase()
    if (SYMBOL_RE.test(symbol)) unique.add(symbol)
    if (unique.size >= MAX_SYMBOLS) break
  }
  return Array.from(unique)
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  const rawBody = await request.text().catch(() => '')
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody)
    } catch {
      return null
    }
  })()
  const symbols = normalizeSymbols(body?.symbols)

  if (symbols.length === 0) {
    return NextResponse.json({ reasons: {} })
  }

  const entries = await mapWithConcurrency(
    symbols,
    MAX_REASON_LOOKUP_CONCURRENCY,
    async (symbol): Promise<[string, BatchReason]> => {
      try {
        const data = await getCachedStockWhyMovingDisplayData(symbol)
        const timestamp = data?.sourceTimestamp || data?.fetchedAt
        const hasFreshCache = Boolean(data && isFreshWhyMovingResult(data))
        let reason = isFreshTimestamp(timestamp)
          ? normalizeReasonText(data?.displayText || data?.summary)
          : null
        let sourceUrl = reason ? (data?.sourceUrl ?? null) : null
        let status: BatchReason['status'] = reason ? 'found' : 'not_found'

        if (!reason && !hasFreshCache) {
          const liveData = await getStockWhyMovingDisplayData(symbol, {
            preferGenerated: false,
          })
          const liveTimestamp = liveData.sourceTimestamp || liveData.fetchedAt
          reason = isFreshTimestamp(liveTimestamp)
            ? normalizeReasonText(liveData.displayText || liveData.summary)
            : null
          sourceUrl = reason ? liveData.sourceUrl || null : null
          status = reason ? 'found' : liveData.status
        }

        if (!reason && !hasFreshCache) {
          const newsReason = await getRecentNewsReason(symbol)
          reason = newsReason.reason
          sourceUrl = newsReason.sourceUrl
          status = reason ? 'found' : status
        }

        return [
          symbol,
          {
            symbol,
            status,
            reason,
            sourceUrl,
          },
        ]
      } catch {
        return [
          symbol,
          {
            symbol,
            status: 'error',
            reason: null,
            sourceUrl: null,
          },
        ]
      }
    },
  )

  return NextResponse.json(
    { reasons: Object.fromEntries(entries) as Record<string, BatchReason> },
    {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    },
  )
}
