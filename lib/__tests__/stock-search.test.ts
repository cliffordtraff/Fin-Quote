import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
}))

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: mocks.createPublicClient,
}))

import {
  normalizeStockSearchQuery,
  searchSymbols,
  StockSearchInputError,
  StockSearchUnavailableError,
} from '@/lib/symbol-resolver'

interface SearchResponse {
  data: unknown
  error: unknown
}

interface QueryCall {
  table: string
  ilike: [column: string, pattern: string] | null
  signal: AbortSignal | null
  limit: number | null
}

function makeSearchClient(
  responses: Record<string, SearchResponse[]>,
  calls: QueryCall[],
) {
  return {
    from(table: string) {
      const response = responses[table]?.shift() ?? { data: [], error: null }
      const call: QueryCall = {
        table,
        ilike: null,
        signal: null,
        limit: null,
      }
      calls.push(call)
      const builder = {
        select() { return builder },
        eq() { return builder },
        ilike(column: string, pattern: string) {
          call.ilike = [column, pattern]
          return builder
        },
        order() { return builder },
        limit(value: number) {
          call.limit = value
          return builder
        },
        abortSignal(signal: AbortSignal) {
          call.signal = signal
          return builder
        },
        then<TResult1 = SearchResponse, TResult2 = never>(
          onfulfilled?: ((value: SearchResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(response).then(onfulfilled, onrejected)
        },
      }
      return builder
    },
  }
}

describe('bounded stock registry search', () => {
  const calls: QueryCall[] = []
  let responses: Record<string, SearchResponse[]>

  beforeEach(() => {
    calls.length = 0
    responses = { us_stocks: [], sp500_constituents: [] }
    mocks.createPublicClient.mockReset()
    mocks.createPublicClient.mockImplementation(() =>
      makeSearchClient(responses, calls),
    )
  })

  it('normalizes whitespace and rejects wildcard/filter control input', () => {
    expect(normalizeStockSearchQuery('  Apple   Inc  ')).toBe('Apple Inc')
    expect(() => normalizeStockSearchQuery('A'.repeat(65))).toThrow(
      StockSearchInputError,
    )
    for (const query of ['A%', 'A_B', 'A,B', '(AAPL)', 'A\\B', 'A\nB']) {
      expect(() => normalizeStockSearchQuery(query)).toThrow(
        StockSearchInputError,
      )
    }
  })

  it('uses only a symbol-prefix query for one character', async () => {
    responses.us_stocks.push({
      data: [{ symbol: 'AAPL', name: 'Apple Inc.', market_cap: 3_000 }],
      error: null,
    })
    const controller = new AbortController()

    await expect(searchSymbols('a', controller.signal)).resolves.toEqual({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      source: 'primary',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      table: 'us_stocks',
      ilike: ['symbol', 'A%'],
      signal: controller.signal,
      limit: 25,
    })
  })

  it('uses symbol and name prefixes for two characters', async () => {
    responses.us_stocks.push(
      { data: [{ symbol: 'MSFT', name: 'Microsoft', market_cap: 2 }], error: null },
      { data: [{ symbol: 'MS', name: 'Morgan Stanley', market_cap: 1 }], error: null },
    )

    await searchSymbols('ms')

    expect(calls.map((call) => call.ilike)).toEqual([
      ['symbol', 'MS%'],
      ['name', 'ms%'],
    ])
  })

  it('uses contains matching for company names from three characters onward', async () => {
    responses.us_stocks.push(
      { data: [], error: null },
      { data: [{ symbol: 'AAPL', name: 'Apple Inc.', market_cap: 1 }], error: null },
    )

    await searchSymbols('app')

    expect(calls[1].ilike).toEqual(['name', '%app%'])
  })

  it('deduplicates, validates, ranks, canonicalizes class shares, and caps results', async () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      symbol: `A${String(index).padStart(2, '0')}`,
      name: `Alpha ${index}`,
      market_cap: index,
    }))
    responses.us_stocks.push(
      {
        data: [
          ...rows,
          { symbol: 'BRK-B', name: 'Berkshire Hathaway', market_cap: 10_000 },
        ],
        error: null,
      },
      {
        data: [
          { symbol: 'BRK.B', name: 'Berkshire Hathaway', market_cap: 10_000 },
          { symbol: 'AAPL', name: 'Apple Inc.', market_cap: 20_000 },
        ],
        error: null,
      },
    )

    const result = await searchSymbols('aapl')

    expect(result).toMatchObject({ source: 'primary' })
    expect(result.results).toHaveLength(10)
    expect(result.results[0]).toEqual({ symbol: 'AAPL', name: 'Apple Inc.' })
    expect(new Set(result.results.map(({ symbol }) => symbol)).size).toBe(
      result.results.length,
    )
  })

  it('queries both class-share separator aliases and ranks the canonical symbol first', async () => {
    responses.us_stocks.push(
      {
        data: [{ symbol: 'BRK-B', name: 'Berkshire Hathaway Inc.', market_cap: 1 }],
        error: null,
      },
      {
        data: [{ symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', market_cap: 2 }],
        error: null,
      },
      { data: [], error: null },
    )

    await expect(searchSymbols('brk-b')).resolves.toEqual({
      results: [{ symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.' }],
      source: 'primary',
    })
    expect(calls.slice(0, 2).map((call) => call.ilike)).toEqual([
      ['symbol', 'BRK.B%'],
      ['symbol', 'BRK-B%'],
    ])
  })

  it('uses the compatibility registry only when the primary query fails', async () => {
    responses.us_stocks.push({ data: null, error: { message: 'down' } })
    responses.sp500_constituents.push({
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      error: null,
    })

    await expect(searchSymbols('A')).resolves.toEqual({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      source: 'fallback',
    })
    expect(calls.map(({ table }) => table)).toEqual([
      'us_stocks',
      'sp500_constituents',
    ])
  })

  it('keeps an authoritative primary miss empty without widening to fallback', async () => {
    responses.us_stocks.push({ data: [], error: null })

    await expect(searchSymbols('ZZ')).resolves.toEqual({
      results: [],
      source: 'primary',
    })
    expect(calls.every(({ table }) => table === 'us_stocks')).toBe(true)
  })

  it('throws unavailable when both registries fail', async () => {
    responses.us_stocks.push({ data: null, error: { message: 'down' } })
    responses.sp500_constituents.push({
      data: null,
      error: { message: 'also down' },
    })

    await expect(searchSymbols('A')).rejects.toBeInstanceOf(
      StockSearchUnavailableError,
    )
  })

  it('keeps an empty compatibility fallback unavailable after a primary outage', async () => {
    responses.us_stocks.push({ data: null, error: { message: 'down' } })
    responses.sp500_constituents.push({ data: [], error: null })

    await expect(searchSymbols('A')).rejects.toBeInstanceOf(
      StockSearchUnavailableError,
    )
  })

  it.each([
    [{ symbol: '', name: 'Malformed', market_cap: 1 }],
    [{ symbol: 'ES=F', name: 'Derivative', market_cap: 1 }],
    [{ symbol: 'AAPL', name: '', market_cap: 1 }],
    [{ symbol: 'AAPL', name: 'Apple Inc.', market_cap: Number.NaN }],
    [null],
  ])('treats runtime-invalid primary rows as unavailable: %j', async (data) => {
    responses.us_stocks.push({ data, error: null })
    responses.sp500_constituents.push({
      data: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      error: null,
    })

    await expect(searchSymbols('A')).rejects.toBeInstanceOf(
      StockSearchUnavailableError,
    )
    expect(calls).toHaveLength(1)
  })

  it('preserves abort identity and never falls back after cancellation', async () => {
    const controller = new AbortController()
    const reason = new DOMException('cancelled', 'AbortError')
    responses.us_stocks.push({ data: null, error: { message: 'down' } })
    controller.abort(reason)

    await expect(searchSymbols('A', controller.signal)).rejects.toBe(reason)
    expect(calls).toHaveLength(0)
  })
})
