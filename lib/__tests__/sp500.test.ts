import { describe, expect, it } from 'vitest'

import { filterToSP500, getSP500Constituent, isSP500, normalizeSP500Symbol } from '@/lib/sp500'

describe('S&P 500 utilities', () => {
  it('normalizes known vendor aliases to the canonical constituent symbol', () => {
    expect(normalizeSP500Symbol('brk-b')).toBe('BRK.B')
    expect(isSP500('BRK-B')).toBe(true)
    expect(getSP500Constituent('BRK-B')?.symbol).toBe('BRK.B')
  })

  it('filters arbitrary symbol lists to active S&P 500 constituents', () => {
    const filtered = filterToSP500([
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'ZZZZ', name: 'Not a constituent' },
      { symbol: 'BRK-B', name: 'Berkshire alias' },
    ])

    expect(filtered.map((item) => item.symbol)).toEqual(['AAPL', 'BRK.B'])
  })
})
