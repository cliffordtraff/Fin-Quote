import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    gt: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
  }

  query.select.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.lte.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.not.mockReturnValue(query)
  query.gt.mockReturnValue(query)
  query.or.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.range.mockResolvedValue({ data: [], error: null })
  query.limit.mockResolvedValue({ data: [], error: null })

  return {
    query,
    from: vi.fn(() => query),
  }
})

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({
    from: mocks.from,
  }),
}))

import {
  getLatestInsiderTrades,
  getTopInsiderTrades,
} from '@/app/actions/insider-trading'

function makeTradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trade-1',
    symbol: 'FINS',
    filing_date: '2026-07-10',
    transaction_date: '2026-07-08',
    reporting_name: 'MetLife Investment Management, LLC',
    owner_type: '10% Owner',
    transaction_code: 'P',
    transaction_type: 'P-Purchase',
    shares: 40_000_000,
    price: 40_000_000,
    shares_owned_after: 40_000_000,
    security_name: '5.364% Series C Senior Unsecured Notes due July 8, 2030',
    sec_link: '',
    acquisition_disposition: 'A',
    form_type: '4',
    value: 1_600_000_000_000_000,
    insider_id: null,
    ...overrides,
  }
}

describe('insider trade query sanity', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-27T16:00:00Z'))
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('excludes future dates and non-transaction ownership forms before applying the limit', async () => {
    await expect(getLatestInsiderTrades(137)).resolves.toEqual({ trades: [] })

    expect(mocks.query.lte).toHaveBeenCalledWith('transaction_date', '2026-07-27')
    expect(mocks.query.in).toHaveBeenCalledWith(
      'form_type',
      ['4', '4/A', '5', '5/A', '144', '144/A']
    )
    expect(mocks.query.limit).toHaveBeenCalledWith(137)

    const lteOrder = mocks.query.lte.mock.invocationCallOrder[0]
    const limitOrder = mocks.query.limit.mock.invocationCallOrder[0]
    expect(lteOrder).toBeLessThan(limitOrder)
  })

  it('uses the New York calendar date near midnight UTC', async () => {
    vi.setSystemTime(new Date('2026-07-28T00:30:00Z'))

    await expect(getLatestInsiderTrades(138)).resolves.toEqual({ trades: [] })

    expect(mocks.query.lte).toHaveBeenCalledWith('transaction_date', '2026-07-27')
  })

  it('normalizes potential debt rows before applying the top-trade limit', async () => {
    const malformedDebt = makeTradeRow()
    const legitimateEquity = makeTradeRow({
      id: 'trade-2',
      symbol: 'BIG',
      reporting_name: 'Institutional Holder',
      shares: 1_000_000,
      price: 100,
      security_name: 'Class A Common Stock',
      value: 100_000_000,
    })

    mocks.query.range.mockResolvedValueOnce({
      data: [malformedDebt],
      error: null,
    })
    mocks.query.limit.mockResolvedValueOnce({
      data: [malformedDebt, legitimateEquity],
      error: null,
    })

    await expect(getTopInsiderTrades(7, 1)).resolves.toEqual({
      trades: [
        expect.objectContaining({
          symbol: 'BIG',
          value: 100_000_000,
        }),
      ],
    })

    expect(mocks.query.limit).toHaveBeenCalledWith(2)
  })
})
