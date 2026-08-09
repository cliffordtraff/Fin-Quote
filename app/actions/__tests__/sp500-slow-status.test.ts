import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  getIntraday: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: () => ({
    getQuotes: mocks.getQuotes,
    getIntraday: mocks.getIntraday,
  }),
}))

import {
  getSP500Gainers,
  getSP500GainersWithStatus,
  getSP500LosersWithStatus,
} from '@/app/actions/sp500-movers'
import { getSP500GainerSparklinesWithStatus } from '@/app/actions/sp500-gainer-sparklines'
import { getSP500LoserSparklinesWithStatus } from '@/app/actions/sp500-loser-sparklines'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('S&P 500 slow-section quote status', () => {
  it('keeps the legacy empty fallback but rejects zero usable quotes in strict mode', async () => {
    mocks.getQuotes.mockResolvedValue([])

    await expect(getSP500Gainers()).resolves.toEqual({ gainers: [] })
    await expect(getSP500GainersWithStatus()).resolves.toEqual({
      error: 'Failed to load S&P 500 gainers',
    })
    await expect(getSP500LosersWithStatus()).resolves.toEqual({
      error: 'Failed to load S&P 500 losers',
    })
    expect(mocks.getQuotes.mock.calls[0][1]).toBeUndefined()
    expect(mocks.getQuotes.mock.calls[1][1]).toEqual({ failureMode: 'throw' })
    expect(mocks.getQuotes.mock.calls[2][1]).toEqual({ failureMode: 'throw' })
  })

  it('accepts a partial batch with at least one usable quote', async () => {
    mocks.getQuotes.mockResolvedValue([{
      symbol: 'AAPL',
      name: 'Apple',
      price: 210,
      change: 2,
      changesPercentage: 1,
    }])

    await expect(getSP500GainersWithStatus()).resolves.toEqual({
      gainers: [expect.objectContaining({ symbol: 'AAPL' })],
    })
    await expect(getSP500LosersWithStatus()).resolves.toEqual({ losers: [] })
  })

  it('propagates the strict mover failure through the slow sparkline variant', async () => {
    mocks.getQuotes.mockResolvedValue([])

    await expect(getSP500GainerSparklinesWithStatus()).resolves.toEqual({
      error: 'Failed to load S&P 500 gainers',
    })
    expect(mocks.getIntraday).not.toHaveBeenCalled()
  })

  it('uses strict candle reads but keeps an authoritative empty window healthy', async () => {
    mocks.getQuotes.mockResolvedValue([{
      symbol: 'AAPL',
      name: 'Apple',
      price: 210,
      change: 2,
      changesPercentage: 1,
    }])
    mocks.getIntraday.mockResolvedValue([])

    await expect(getSP500GainerSparklinesWithStatus()).resolves.toEqual({
      sparklines: [],
    })
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'AAPL',
      5,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw' },
    )
  })

  it('reports a strict candle failure instead of a healthy empty sparkline list', async () => {
    mocks.getQuotes.mockResolvedValue([{
      symbol: 'AAPL',
      name: 'Apple',
      price: 210,
      change: 2,
      changesPercentage: 1,
    }])
    mocks.getIntraday.mockRejectedValue(new Error('status 503'))

    await expect(getSP500GainerSparklinesWithStatus()).resolves.toEqual({
      error: 'Failed to load S&P 500 gainer sparklines',
    })
  })

  it('threads the same strict candle contract through loser sparklines', async () => {
    mocks.getQuotes.mockResolvedValue([{
      symbol: 'MSFT',
      name: 'Microsoft',
      price: 400,
      change: -4,
      changesPercentage: -1,
    }])
    mocks.getIntraday.mockRejectedValue(new Error('malformed candle payload'))

    await expect(getSP500LoserSparklinesWithStatus()).resolves.toEqual({
      error: 'Failed to load S&P 500 loser sparklines',
    })
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'MSFT',
      5,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw' },
    )
  })
})
