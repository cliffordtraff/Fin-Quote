import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  getQuote: vi.fn(),
  getIntraday: vi.fn(),
  getHistoricalDaily: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: () => providerMocks,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}))

import {
  getESFuturesMarketData,
  getESFuturesMarketDataWithStatus,
} from '@/app/actions/market-data'

describe('ES futures slow-section status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    providerMocks.getQuote.mockResolvedValue({
      symbol: 'ES=F',
      name: 'S&P 500',
      price: 6_400,
      change: 10,
      changesPercentage: 0.16,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves legacy provider calls for existing consumers', async () => {
    providerMocks.getIntraday.mockResolvedValue([])
    providerMocks.getHistoricalDaily.mockResolvedValue([])

    await expect(getESFuturesMarketData()).resolves.toMatchObject({
      currentPrice: 6_400,
      priceHistory: [],
    })
    expect(providerMocks.getQuote).toHaveBeenCalledWith('ES=F')
    expect(providerMocks.getIntraday).toHaveBeenCalledWith('ES=F', 1, 'minute')
    expect(providerMocks.getHistoricalDaily).toHaveBeenCalledWith(
      'ES=F',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )
  })

  it('accepts strict HTTP-200 empty windows and attempts the daily fallback', async () => {
    providerMocks.getIntraday.mockResolvedValue([])
    providerMocks.getHistoricalDaily.mockResolvedValue([])

    await expect(getESFuturesMarketDataWithStatus()).resolves.toMatchObject({
      currentPrice: 6_400,
      priceHistory: [],
    })
    expect(providerMocks.getQuote).toHaveBeenCalledWith('ES=F', {
      freshness: 'live',
    })
    expect(providerMocks.getIntraday).toHaveBeenCalledWith(
      'ES=F',
      1,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw' },
    )
    expect(providerMocks.getHistoricalDaily).toHaveBeenCalledWith(
      'ES=F',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      undefined,
      { failureMode: 'throw' },
    )
  })

  it('reports strict candle failures instead of returning a healthy empty history', async () => {
    providerMocks.getIntraday.mockRejectedValue(new Error('status 503'))

    await expect(getESFuturesMarketDataWithStatus()).resolves.toEqual({
      error: 'Failed to fetch market data',
    })
    expect(providerMocks.getHistoricalDaily).not.toHaveBeenCalled()
  })
})
