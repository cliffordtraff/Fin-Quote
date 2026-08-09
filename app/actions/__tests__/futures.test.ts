import { beforeEach, describe, expect, it, vi } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  getHistoricalDaily: vi.fn(),
}))

vi.mock('@/lib/providers/fmp', () => ({
  FMPProvider: class {
    getQuotes = providerMocks.getQuotes
    getHistoricalDaily = providerMocks.getHistoricalDaily
  },
}))

import {
  getFuturesWithHistoryWithStatus,
  getFuturesWithYTDSparkline,
  getFuturesWithYTDSparklineWithStatus,
} from '@/app/actions/futures'

describe('futures data', () => {
  beforeEach(() => {
    providerMocks.getQuotes.mockReset()
    providerMocks.getHistoricalDaily.mockReset()
  })

  it('uses FMP futures symbols for quotes and history', async () => {
    providerMocks.getQuotes.mockResolvedValue([
      {
        symbol: 'CLUSD',
        name: 'Crude Oil',
        price: 72,
        change: 1,
        changesPercentage: 1.4,
      },
    ])
    providerMocks.getHistoricalDaily.mockResolvedValue([
      { date: '2026-01-02', close: 60 },
      { date: '2026-07-28', close: 72 },
    ])

    const result = await getFuturesWithYTDSparkline()

    expect(providerMocks.getQuotes).toHaveBeenCalledWith([
      'CLUSD',
      'NGUSD',
      'GCUSD',
      'YMUSD',
      'ESUSD',
      'NQUSD',
      'RTYUSD',
    ])
    expect(providerMocks.getHistoricalDaily).toHaveBeenCalledWith(
      'CLUSD',
      expect.stringMatching(/^\d{4}-01-01$/),
    )
    expect('futures' in result && result.futures[0].symbol).toBe('CL=F')
  })

  it('treats an empty fixed futures quote batch as failed in status-preserving loaders', async () => {
    providerMocks.getQuotes.mockResolvedValue([])

    await expect(getFuturesWithYTDSparklineWithStatus()).resolves.toEqual({
      error: 'Failed to load futures data',
    })
    expect(providerMocks.getQuotes).toHaveBeenNthCalledWith(1, [
      'CLUSD',
      'NGUSD',
      'GCUSD',
      'YMUSD',
      'ESUSD',
      'NQUSD',
      'RTYUSD',
    ], { freshness: 'live' })

    await expect(getFuturesWithHistoryWithStatus()).resolves.toEqual({
      error: 'Failed to load futures data',
    })
    expect(providerMocks.getQuotes).toHaveBeenNthCalledWith(2, [
      'CLUSD',
      'NGUSD',
      'GCUSD',
      'SIUSD',
    ], { freshness: 'live' })
    expect(providerMocks.getHistoricalDaily).not.toHaveBeenCalled()
  })

  it('uses strict candle reads while accepting authoritative empty histories', async () => {
    const quote = (symbol: string) => ({
      symbol,
      name: symbol,
      price: 100,
      change: 1,
      changesPercentage: 1,
    })
    providerMocks.getQuotes
      .mockResolvedValueOnce([
        'CLUSD',
        'NGUSD',
        'GCUSD',
        'YMUSD',
        'ESUSD',
        'NQUSD',
        'RTYUSD',
      ].map(quote))
      .mockResolvedValueOnce(['CLUSD', 'NGUSD', 'GCUSD', 'SIUSD'].map(quote))
    providerMocks.getHistoricalDaily.mockResolvedValue([])

    await expect(getFuturesWithYTDSparklineWithStatus()).resolves.toMatchObject({
      futures: expect.arrayContaining([
        expect.objectContaining({ symbol: 'ES=F', ytdPriceHistory: [] }),
      ]),
    })
    await expect(getFuturesWithHistoryWithStatus()).resolves.toMatchObject({
      futuresWithHistory: expect.arrayContaining([
        expect.objectContaining({ symbol: 'CL=F', priceHistory: [] }),
      ]),
    })

    expect(providerMocks.getHistoricalDaily).toHaveBeenCalledTimes(11)
    for (const call of providerMocks.getHistoricalDaily.mock.calls) {
      expect(call[2]).toBeUndefined()
      expect(call[3]).toEqual({ failureMode: 'throw' })
    }
  })

  it('reports a strict candle provider failure instead of a healthy empty section', async () => {
    providerMocks.getQuotes.mockResolvedValue([
      'CLUSD',
      'NGUSD',
      'GCUSD',
      'YMUSD',
      'ESUSD',
      'NQUSD',
      'RTYUSD',
    ].map((symbol) => ({
      symbol,
      name: symbol,
      price: 100,
      change: 1,
      changesPercentage: 1,
    })))
    providerMocks.getHistoricalDaily.mockRejectedValue(new Error('status 503'))

    await expect(getFuturesWithYTDSparklineWithStatus()).resolves.toEqual({
      error: 'Failed to load futures data',
    })
    expect(providerMocks.getHistoricalDaily).toHaveBeenCalledWith(
      'CLUSD',
      expect.stringMatching(/^\d{4}-01-01$/),
      undefined,
      { failureMode: 'throw' },
    )
  })
})
