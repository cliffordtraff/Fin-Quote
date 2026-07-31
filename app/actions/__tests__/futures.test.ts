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

import { getFuturesWithYTDSparkline } from '@/app/actions/futures'

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
})
