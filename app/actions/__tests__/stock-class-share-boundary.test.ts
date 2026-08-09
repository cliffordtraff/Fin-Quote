import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  createServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: mocks.createPublicClient,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: mocks.createServerClient,
}))

import { getAllFinancials } from '@/app/actions/get-all-financials'
import { getCompanyProfile } from '@/app/actions/get-company-profile'
import { getInsiderTradesBySymbol } from '@/app/actions/insider-trading'
import { getSegmentData } from '@/app/actions/segment-data'
import { getStockKeyStats } from '@/app/actions/stock-key-stats'

interface SymbolLookup {
  table: string
  values: string[]
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createSupabaseClient(symbolLookups: SymbolLookup[]) {
  return {
    from(table: string) {
      const result = { data: [], error: null }
      const query: Record<string, unknown> = {}
      const chain = () => query

      for (const method of [
        'select',
        'eq',
        'gte',
        'lte',
        'order',
        'limit',
      ]) {
        query[method] = vi.fn(chain)
      }
      query.in = vi.fn((column: string, values: string[]) => {
        if (column === 'symbol') {
          symbolLookups.push({ table, values: [...values] })
        }
        return query
      })
      query.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      query.then = (
        onFulfilled: (value: typeof result) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected)
      return query
    },
  }
}

let publicSymbolLookups: SymbolLookup[]
let serverSymbolLookups: SymbolLookup[]

beforeEach(() => {
  vi.clearAllMocks()
  publicSymbolLookups = []
  serverSymbolLookups = []
  mocks.createPublicClient.mockImplementation(() =>
    createSupabaseClient(publicSymbolLookups),
  )
  mocks.createServerClient.mockImplementation(async () =>
    createSupabaseClient(serverSymbolLookups),
  )
  process.env.FMP_API_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.FMP_API_KEY
})

describe('stock class-share action boundary', () => {
  it('converts profile requests and refuses to relabel a mismatched company', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        { symbol: 'BRK-B', companyName: 'Berkshire Hathaway Inc.' },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { symbol: 'BF-B', companyName: 'Brown-Forman Corporation' },
      ]))
      .mockResolvedValueOnce(jsonResponse([
        { symbol: 'BF-B', companyName: 'Wrong company' },
      ]))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getCompanyProfile('brk-b')).resolves.toMatchObject({
      symbol: 'BRK.B',
      companyName: 'Berkshire Hathaway Inc.',
    })
    await expect(getCompanyProfile('BF.B')).resolves.toMatchObject({
      symbol: 'BF.B',
      companyName: 'Brown-Forman Corporation',
    })
    await expect(getCompanyProfile('BRK.A')).resolves.toBeNull()

    expect(String(fetchMock.mock.calls[0][0])).toContain('/profile/BRK-B')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/profile/BF-B')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/profile/BRK-A')
  })

  it('uses the FMP alias and both database aliases throughout key statistics', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          symbol: 'BF-B',
          price: 45,
          change: 1,
          changesPercentage: 2,
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'BF-B' }]))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'BF-B' }]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStockKeyStats('bf-b')).resolves.toMatchObject({ price: 45 })

    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote/BF-B')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/key-metrics/BF-B')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/ratios/BF-B')
    expect(publicSymbolLookups.map(({ table }) => table)).toEqual([
      'financial_metrics',
      'financials_std',
      'company_profile',
      'price_performance',
      'analyst_estimates',
      'earnings_history',
      'technical_indicators',
    ])
    expect(publicSymbolLookups.every(({ values }) =>
      JSON.stringify(values) === JSON.stringify(['BF.B', 'BF-B'])
    )).toBe(true)
  })

  it('rejects a mismatched direct quote instead of installing another company stats', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          symbol: 'BF-B',
          price: 45,
          change: 1,
          changesPercentage: 2,
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'BRK-A' }]))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'BRK-A' }]))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getStockKeyStats('BRK.A')).rejects.toThrow(
      'FMP quote symbol mismatch for BRK.A',
    )
    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote/BRK-A')
  })

  it('queries both canonical and ingested aliases in the remaining heavy database paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await getAllFinancials('brk-a')
    await getInsiderTradesBySymbol('bf-b', 20)

    expect(publicSymbolLookups).toEqual(expect.arrayContaining([
      { table: 'financials_std', values: ['BRK.A', 'BRK-A'] },
      { table: 'financial_metrics', values: ['BRK.A', 'BRK-A'] },
      { table: 'insider_transactions', values: ['BF.B', 'BF-B'] },
    ]))
  })

  it('queries both class-share aliases for stock-v1 segment data', async () => {
    await expect(getSegmentData({
      symbol: 'brk-a',
      segmentType: 'product',
      periodType: 'annual',
    })).resolves.toMatchObject({ data: null })

    expect(serverSymbolLookups).toContainEqual({
      table: 'company_metrics',
      values: ['BRK.A', 'BRK-A'],
    })
  })
})
