export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCompanyProfile } from '@/app/actions/get-company-profile'
import {
  getPulseTextContext,
  PulseTextContextCapacityError,
  PulseTextContextLoadTimeoutError,
} from '@/lib/pulse-text-context-cache'
import {
  parsePulseTextContext,
  parsePulseTextSymbol,
  type PulseTextSymbol,
} from '@/lib/pulse-text-context'
import { getProvider } from '@/lib/providers'

const SUCCESS_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=300'
const ERROR_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function errorResponse(message: string, status: number, retryAfter?: string) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: retryAfter
        ? { ...ERROR_HEADERS, 'Retry-After': retryAfter }
        : ERROR_HEADERS,
    },
  )
}

function decodeSymbol(value: string): PulseTextSymbol | null {
  try {
    return parsePulseTextSymbol(decodeURIComponent(value))
  } catch {
    return null
  }
}

async function loadCompleteContext(
  symbol: PulseTextSymbol,
  signal: AbortSignal,
) {
  const provider = getProvider()
  const [newsResult, profileResult] = await Promise.allSettled([
    provider.getNews(symbol, 3, { failureMode: 'throw', signal }),
    getCompanyProfile(symbol, { failureMode: 'throw', signal }),
  ])
  signal.throwIfAborted()
  if (newsResult.status === 'rejected') throw newsResult.reason
  if (profileResult.status === 'rejected') throw profileResult.reason
  const news = newsResult.value
  const profile = profileResult.value

  const parsed = parsePulseTextContext({
    news: news.map((item) => ({
      title: item.title,
      publishedDate: item.publishedDate,
      site: item.site,
      url: item.url,
    })),
    profile,
  }, symbol)
  if (!parsed.ok) {
    throw new Error('Pulse text-context upstream payload was malformed.')
  }
  return parsed.value
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params
  const symbol = decodeSymbol(rawSymbol)
  if (!symbol) return errorResponse('Invalid symbol', 400)

  try {
    const result = await getPulseTextContext(
      symbol,
      (signal) => loadCompleteContext(symbol, signal),
      request.signal,
    )

    return NextResponse.json(result.value, {
      headers: {
        'Cache-Control': SUCCESS_CACHE_CONTROL,
        'X-Cache': result.cacheStatus,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason
    if (error instanceof PulseTextContextLoadTimeoutError) {
      return errorResponse('Context is temporarily unavailable', 503, '5')
    }
    if (error instanceof PulseTextContextCapacityError) {
      return errorResponse('Context is temporarily unavailable', 503, '5')
    }
    return errorResponse('Context is temporarily unavailable', 503, '5')
  }
}
