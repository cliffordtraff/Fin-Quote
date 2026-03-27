import { describe, expect, it } from 'vitest'
import { rankLargeInsiderTrades, type LargeInsiderTradeCandidate } from '@/lib/insider-large-trades'

describe('rankLargeInsiderTrades', () => {
  it('filters out form 3 rows, future dates, and non-buy-sell transactions', () => {
    const candidates: LargeInsiderTradeCandidate[] = [
      {
        symbol: 'CPAY',
        reportingName: 'Walker Peter',
        transactionDate: '2026-07-15',
        transactionCode: '',
        shares: 26958.53,
        price: 144.79,
        acquisitionDisposition: '',
        formType: '3',
      },
      {
        symbol: 'FRPH',
        reportingName: 'BAKER JOHN D II',
        transactionDate: '2026-03-23',
        transactionCode: 'P',
        shares: 478468,
        price: 20.9,
        acquisitionDisposition: 'A',
        formType: '4',
      },
      {
        symbol: 'HTHT',
        reportingName: 'Jin Hui',
        transactionDate: '2026-03-26',
        transactionCode: 'M',
        shares: 147850,
        price: 12,
        acquisitionDisposition: 'A',
        formType: '4',
      },
    ]

    expect(rankLargeInsiderTrades(candidates, {
      fromDate: '2026-02-27',
      toDate: '2026-03-27',
      limit: 6,
    })).toEqual([
      expect.objectContaining({
        symbol: 'FRPH',
        reportingName: 'BAKER JOHN D II',
        transactionCode: 'P',
        value: 9_999_981.2,
      }),
    ])
  })

  it('aggregates split trade lines for the same insider, day, and transaction code', () => {
    const candidates: LargeInsiderTradeCandidate[] = [
      {
        symbol: 'FLOC',
        reportingName: 'Fairbanks Jonathan B.',
        transactionDate: '2026-03-23',
        transactionCode: 'S',
        shares: 94_694,
        price: 21.175,
        acquisitionDisposition: 'D',
        formType: '4',
      },
      {
        symbol: 'FLOC',
        reportingName: 'Fairbanks Jonathan B.',
        transactionDate: '2026-03-23',
        transactionCode: 'S',
        shares: 83_795,
        price: 21.175,
        acquisitionDisposition: 'D',
        formType: '4',
      },
      {
        symbol: 'FLOC',
        reportingName: 'Fairbanks Jonathan B.',
        transactionDate: '2026-03-23',
        transactionCode: 'S',
        shares: 4_031_250,
        price: 21.175,
        acquisitionDisposition: 'D',
        formType: '4',
      },
    ]

    const [trade] = rankLargeInsiderTrades(candidates, {
      fromDate: '2026-02-27',
      toDate: '2026-03-27',
      limit: 6,
    })

    expect(trade).toEqual(expect.objectContaining({
      symbol: 'FLOC',
      reportingName: 'Fairbanks Jonathan B.',
      shares: 4_209_739,
      value: 89_141_223.325,
      transactionCode: 'S',
    }))
  })

  it('deduplicates the same raw trade arriving from multiple sources before aggregating', () => {
    const duplicatedTrade: LargeInsiderTradeCandidate = {
      symbol: 'BORR',
      reportingName: 'Troim Tor Olav',
      transactionDate: '2026-03-24',
      transactionCode: 'P',
      shares: 500_000,
      price: 5.1958,
      acquisitionDisposition: 'A',
      formType: '4',
    }

    const [trade] = rankLargeInsiderTrades([duplicatedTrade, duplicatedTrade], {
      fromDate: '2026-02-27',
      toDate: '2026-03-27',
      limit: 6,
    })

    expect(trade.value).toBe(2_597_900)
    expect(trade.shares).toBe(500_000)
  })

  it('prefers the transaction code when the acquisition flag disagrees', () => {
    const [trade] = rankLargeInsiderTrades([
      {
        symbol: 'MBAV',
        reportingName: 'CANTOR FITZGERALD, L. P.',
        transactionDate: '2026-03-24',
        transactionCode: 'S',
        shares: 7_779_865,
        price: 10.8,
        acquisitionDisposition: 'A',
        formType: '4',
      },
    ], {
      fromDate: '2026-02-27',
      toDate: '2026-03-27',
      limit: 6,
    })

    expect(trade).toEqual(expect.objectContaining({
      symbol: 'MBAV',
      transactionCode: 'S',
      acquisitionDisposition: 'D',
      value: 84_022_542,
    }))
  })
})
