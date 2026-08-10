import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildFinancialPoints,
  fetchMarketContext,
} from '@/lib/newsletter/fetch-context'

const ORIGINAL_FMP_API_KEY = process.env.FMP_API_KEY

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('buildFinancialPoints', () => {
  it('preserves missing free cash flow values as null instead of coercing them to zero', () => {
    const points = buildFinancialPoints(
      [
        {
          year: 2024,
          revenue: 100,
          gross_profit: 30,
          net_income: 10,
          operating_income: 20,
          eps: 1.5,
        },
        {
          year: 2025,
          revenue: 110,
          gross_profit: 33,
          net_income: 11,
          operating_income: 22,
          eps: 1.7,
        },
      ],
      new Map([['2024-FY', 7]]),
      'annual',
    )

    expect(points[0]?.freeCashFlow).toBe(7)
    expect(points[1]?.freeCashFlow).toBeNull()
  })
})

describe('newsletter market context', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-fmp-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_FMP_API_KEY === undefined) {
      delete process.env.FMP_API_KEY
    } else {
      process.env.FMP_API_KEY = ORIGINAL_FMP_API_KEY
    }
  })

  it('fills a thin premarket movers feed from current S&P 500 batch quotes', async () => {
    const actives = ['AAPL', 'CCL', 'INTC', 'NVDA', 'PLTR', 'SMCI', 'TTD'].map(
      (symbol, index) => ({
        symbol,
        name: symbol,
        price: 100 + index,
        change: index / 10,
        changesPercentage: index / 10,
      }),
    )
    const quoteRequests: string[] = []
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/stock_market/actives')) return jsonResponse(actives)
        if (
          url.includes('/stock_market/gainers') ||
          url.includes('/stock_market/losers') ||
          url.includes('/earning_calendar') ||
          url.includes('/stock_news')
        ) {
          return jsonResponse([])
        }
        if (url.includes('/api/v3/quote/')) {
          quoteRequests.push(url)
          const symbols = url
            .split('/api/v3/quote/')[1]
            .split('?')[0]
            .split(',')
          return jsonResponse(
            symbols.map((symbol, index) => ({
              symbol,
              name: `Company ${symbol}`,
              price: 50 + index,
              change: index % 2 === 0 ? index : -index,
              changesPercentage: index % 2 === 0 ? index : -index,
            })),
          )
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })

    const context = await fetchMarketContext()

    expect(fetchMock).toHaveBeenCalled()
    expect(quoteRequests.length).toBeGreaterThan(1)
    expect(context.candidates).toHaveLength(50)
    expect(new Set(context.candidates.map(({ symbol }) => symbol)).size).toBe(
      50,
    )
    expect(context.candidates.map(({ symbol }) => symbol)).toEqual(
      expect.arrayContaining(actives.map(({ symbol }) => symbol)),
    )
  })
})
