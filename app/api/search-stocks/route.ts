import { NextRequest, NextResponse } from 'next/server'
import {
  normalizeStockSearchQuery,
  searchSymbols,
  StockSearchInputError,
  StockSearchUnavailableError,
} from '@/lib/symbol-resolver'
import {
  getAdmittedStockSearch,
  StockSearchCapacityError,
  StockSearchLoadTimeoutError,
  StockSearchRuntimeContractError,
} from '@/lib/stock-search-admission'
import {
  createStockSearchEnvelope,
  type StockSearchEnvelope,
  type StockSearchErrorEnvelope,
} from '@/lib/stock-search-contract'

const SUCCESS_CACHE_CONTROL =
  'public, max-age=30, s-maxage=30, stale-while-revalidate=30'
const NO_STORE = 'no-store'

function json(
  body: StockSearchEnvelope | StockSearchErrorEnvelope,
  init: {
    status?: number
    cacheControl?: string
    headers?: Record<string, string>
  } = {},
) {
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      'Cache-Control': init.cacheControl ?? NO_STORE,
      'X-Content-Type-Options': 'nosniff',
      ...init.headers,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const query = normalizeStockSearchQuery(
      request.nextUrl.searchParams.get('q'),
    )
    if (!query) {
      return json(
        createStockSearchEnvelope({ results: [], source: 'primary' }),
        { cacheControl: SUCCESS_CACHE_CONTROL },
      )
    }

    request.signal.throwIfAborted()
    const outcome = await getAdmittedStockSearch(
      query,
      searchSymbols,
      request.signal,
    )
    request.signal.throwIfAborted()
    const envelope = createStockSearchEnvelope(outcome)
    return json(
      envelope,
      envelope.degraded
        ? {
            headers: { 'X-Stock-Search-Degraded': 'true' },
          }
        : { cacheControl: SUCCESS_CACHE_CONTROL },
    )
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error
    }
    if (error instanceof StockSearchInputError) {
      return json({ error: error.message }, { status: 400 })
    }
    if (
      error instanceof StockSearchUnavailableError ||
      error instanceof StockSearchLoadTimeoutError ||
      error instanceof StockSearchRuntimeContractError
    ) {
      return json({ error: 'Search unavailable' }, { status: 503 })
    }
    if (error instanceof StockSearchCapacityError) {
      return json(
        { error: 'Search unavailable' },
        {
          status: 503,
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
        },
      )
    }
    console.error('Stock search unavailable')
    return json({ error: 'Search unavailable' }, { status: 503 })
  }
}
