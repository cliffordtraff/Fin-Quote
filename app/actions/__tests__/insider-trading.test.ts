import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    lte: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }

  query.select.mockReturnValue(query)
  query.lte.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
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

import { getLatestInsiderTrades } from '@/app/actions/insider-trading'

describe('insider trade query sanity', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-27T16:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
