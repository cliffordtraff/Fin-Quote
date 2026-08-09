import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getGainers: vi.fn(),
  getLosers: vi.fn(),
  getQuotes: vi.fn(),
  getIntraday: vi.fn(),
  maybeSingle: vi.fn(),
  marketStatus: {
    session: 'premarket' as
      | 'premarket'
      | 'cash'
      | 'afterhours'
      | 'closed',
    isFetchingEnabled: false,
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    return { from: vi.fn(() => query) }
  },
}))

vi.mock('@/lib/market-hours', () => ({
  getTradingDate: () => '2026-08-07',
  getMarketStatus: () => ({ ...mocks.marketStatus }),
}))

vi.mock('@/app/actions/scan-extended-hours', () => ({
  deriveGainers: vi.fn().mockResolvedValue([]),
  deriveLosers: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: () => ({
    getGainers: mocks.getGainers,
    getLosers: mocks.getLosers,
    getQuotes: mocks.getQuotes,
    getIntraday: mocks.getIntraday,
  }),
}))

import { getAllSessionMoversWithStatus } from '@/app/actions/market-movers'

const quote = {
  symbol: 'AAPL',
  name: 'Apple',
  price: 200,
  change: 2,
  changesPercentage: 1,
}

describe('getAllSessionMoversWithStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.marketStatus.session = 'premarket'
    mocks.marketStatus.isFetchingEnabled = false
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.getGainers.mockResolvedValue([])
    mocks.getLosers.mockResolvedValue([])
    mocks.getQuotes.mockResolvedValue([quote])
    mocks.getIntraday.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        date: `2026-08-07 09:3${index}:00`,
        timestampMs: index + 1,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
      })),
    )
  })

  it('returns explicit failure when provider and cache fallbacks collapse to empty', async () => {
    await expect(getAllSessionMoversWithStatus('gainers')).resolves.toEqual({
      error: 'No gainers data returned',
    })
  })

  it('returns a chartable non-empty panel as healthy', async () => {
    mocks.getGainers.mockResolvedValue([quote])

    const result = await getAllSessionMoversWithStatus('gainers')

    expect(result).not.toHaveProperty('error')
    expect('cash' in result ? result.cash : []).toEqual([quote])
  })

  it('rejects an expired cash-session fallback instead of relabeling it fresh', async () => {
    mocks.marketStatus.session = 'cash'
    mocks.maybeSingle.mockResolvedValue({
      data: {
        data: [quote],
        fetched_at: new Date(Date.now() - 61_000).toISOString(),
      },
      error: null,
    })

    await expect(getAllSessionMoversWithStatus('gainers')).resolves.toEqual({
      error: 'No gainers data returned',
    })
  })

  it('accepts a genuinely fresh live cash fallback', async () => {
    mocks.marketStatus.session = 'cash'
    mocks.maybeSingle.mockResolvedValue({
      data: {
        data: [quote],
        fetched_at: new Date(Date.now() - 1_000).toISOString(),
      },
      error: null,
    })

    const result = await getAllSessionMoversWithStatus('gainers')

    expect(result).not.toHaveProperty('error')
    expect('cash' in result ? result.cash : []).toEqual([quote])
  })

  it.each(['afterhours', 'closed'] as const)(
    'retains an authoritative %s closing snapshot beyond the live TTL',
    async (session) => {
      mocks.marketStatus.session = session
      mocks.maybeSingle.mockResolvedValue({
        data: {
          data: [quote],
          fetched_at: new Date(Date.now() - 12 * 60 * 60 * 1_000).toISOString(),
        },
        error: null,
      })

      const result = await getAllSessionMoversWithStatus('gainers')

      expect(result).not.toHaveProperty('error')
      expect('currentSession' in result ? result.currentSession : null).toBe(
        session,
      )
      expect('cash' in result ? result.cash : []).toEqual([quote])
    },
  )

  it('does not collapse caller cancellation into an empty-data status', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('left', 'AbortError'))

    await expect(
      getAllSessionMoversWithStatus('gainers', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
