import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
}))

vi.mock('@/lib/symbol-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/symbol-resolver')>()
  return { ...actual, searchSymbols: mocks.searchSymbols }
})

import { GET } from '@/app/api/search-stocks/route'
import { StockSearchUnavailableError } from '@/lib/symbol-resolver'
import {
  resetStockSearchAdmissionForTests,
  STOCK_SEARCH_LOAD_TIMEOUT_MS,
  STOCK_SEARCH_PHYSICAL_MAX,
} from '@/lib/stock-search-admission'
import {
  MAX_STOCK_SEARCH_QUERY_LENGTH,
  parseStockSearchEnvelope,
} from '@/lib/stock-search-contract'

function request(query: string, signal?: AbortSignal) {
  return new NextRequest(
    `https://theintraday.com/api/search-stocks?q=${encodeURIComponent(query)}`,
    { signal },
  )
}

describe('GET /api/search-stocks', () => {
  beforeEach(() => {
    resetStockSearchAdmissionForTests()
    mocks.searchSymbols.mockReset()
    mocks.searchSymbols.mockResolvedValue({ results: [], source: 'primary' })
  })

  afterEach(() => {
    resetStockSearchAdmissionForTests()
    vi.useRealTimers()
  })

  it('returns a bounded public empty result for a blank query', async () => {
    const response = await GET(request('   '))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      results: [],
      degraded: false,
    })
    expect(parseStockSearchEnvelope(body)).toEqual(body)
    expect(response.headers.get('cache-control')).toContain('s-maxage=30')
    expect(mocks.searchSymbols).not.toHaveBeenCalled()
  })

  it('canonicalizes whitespace and forwards one deadline signal', async () => {
    mocks.searchSymbols.mockResolvedValue({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      source: 'primary',
    })

    const response = await GET(request('  Apple   Inc  '))

    expect(response.status).toBe(200)
    expect(mocks.searchSymbols).toHaveBeenCalledWith(
      'Apple Inc',
      expect.any(AbortSignal),
    )
    const body = await response.json()
    expect(body).toEqual({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      degraded: false,
    })
    expect(parseStockSearchEnvelope(body)).toEqual(body)
    expect(response.headers.get('x-stock-search-degraded')).toBeNull()
  })

  it('marks nonempty compatibility results degraded and never publicly caches them', async () => {
    mocks.searchSymbols.mockResolvedValue({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      source: 'fallback',
    })

    const response = await GET(request('Apple'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-stock-search-degraded')).toBe('true')
    const body = await response.json()
    expect(body).toEqual({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      degraded: true,
    })
    expect(parseStockSearchEnvelope(body)).toEqual(body)
  })

  it.each(['A%', 'A_B', 'A,B', '(AAPL)', 'A\\B'])(
    'rejects filter-control input %s before database work',
    async (query) => {
      const response = await GET(request(query))

      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(mocks.searchSymbols).not.toHaveBeenCalled()
    },
  )

  it('rejects oversized input before database work', async () => {
    const response = await GET(
      request('A'.repeat(MAX_STOCK_SEARCH_QUERY_LENGTH + 1)),
    )

    expect(response.status).toBe(400)
    expect(mocks.searchSymbols).not.toHaveBeenCalled()
  })

  it('accepts the shared maximum query length', async () => {
    const query = 'A'.repeat(MAX_STOCK_SEARCH_QUERY_LENGTH)

    const response = await GET(request(query))

    expect(response.status).toBe(200)
    expect(mocks.searchSymbols).toHaveBeenCalledWith(
      query,
      expect.any(AbortSignal),
    )
  })

  it('returns a typed no-store unavailable response', async () => {
    mocks.searchSymbols.mockRejectedValue(new StockSearchUnavailableError())

    const response = await GET(request('AAPL'))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Search unavailable',
    })
  })

  it('enforces the deadline even when a search implementation ignores abort', async () => {
    vi.useFakeTimers()
    mocks.searchSymbols.mockReturnValue(new Promise(() => undefined))

    const pending = GET(request('AAPL'))
    await vi.advanceTimersByTimeAsync(STOCK_SEARCH_LOAD_TIMEOUT_MS + 1)

    const response = await pending
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Search unavailable',
    })
  })

  it('returns unavailable instead of converting an invalid runtime outcome to empty', async () => {
    mocks.searchSymbols.mockResolvedValue({
      results: [{ symbol: '', name: '' }],
      source: 'primary',
    })

    const response = await GET(request('AAPL'))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Search unavailable',
    })
  })

  it('rejects excess unique physical searches with a bounded retry hint', async () => {
    mocks.searchSymbols.mockReturnValue(new Promise(() => undefined))
    const admitted = Array.from({ length: STOCK_SEARCH_PHYSICAL_MAX }, (_, index) =>
      GET(request(`A${index}`)),
    )
    await Promise.resolve()

    const response = await GET(request('OVERFLOW'))

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')

    resetStockSearchAdmissionForTests()
    await Promise.all(admitted)
  })

  it('preserves caller abort identity', async () => {
    const controller = new AbortController()
    const reason = new DOMException('gone', 'AbortError')
    mocks.searchSymbols.mockReturnValue(new Promise(() => undefined))

    const pending = GET(request('AAPL', controller.signal))
    controller.abort(reason)

    await expect(pending).rejects.toBe(reason)
  })
})
