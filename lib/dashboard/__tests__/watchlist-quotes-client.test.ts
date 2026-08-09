import { describe, expect, it } from 'vitest'
import { parseWatchlistQuoteBatchResponse } from '@/lib/dashboard/watchlist-quotes-client'

function quote(symbol: string, price = 100) {
  return {
    symbol,
    name: `${symbol} Incorporated`,
    price,
    change: 1,
    changesPercentage: 1,
  }
}

describe('parseWatchlistQuoteBatchResponse', () => {
  it('accepts one exact ordered batch and converts provider percentage naming', () => {
    expect(parseWatchlistQuoteBatchResponse(
      { quotes: [quote('AAPL'), quote('MSFT', 200)] },
      ['AAPL', 'MSFT'],
    )).toEqual([
      {
        symbol: 'AAPL',
        name: 'AAPL Incorporated',
        price: 100,
        change: 1,
        changePercent: 1,
      },
      {
        symbol: 'MSFT',
        name: 'MSFT Incorporated',
        price: 200,
        change: 1,
        changePercent: 1,
      },
    ])
  })

  it.each([
    { quotes: [quote('AAPL')] },
    { quotes: [quote('MSFT'), quote('AAPL')] },
    { quotes: [quote('AAPL'), quote('AAPL')] },
    { quotes: [quote('AAPL'), { ...quote('MSFT'), price: 0 }] },
    { quotes: [quote('AAPL'), { ...quote('MSFT'), change: Number.NaN }] },
    { quotes: [quote('AAPL'), { ...quote('MSFT'), extra: true }] },
    { quotes: [quote('AAPL'), { ...quote('MSFT'), name: ' MSFT' }] },
    { quotes: [quote('AAPL'), quote('MSFT')], extra: true },
    [quote('AAPL'), quote('MSFT')],
  ])('rejects malformed or identity-ambiguous payload %#', (payload) => {
    expect(parseWatchlistQuoteBatchResponse(payload, ['AAPL', 'MSFT'])).toBeNull()
  })
})
