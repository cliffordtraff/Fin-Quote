import { describe, expect, it } from 'vitest'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'

describe('market symbols', () => {
  it('canonicalizes class-share aliases before provider and cache use', () => {
    expect(normalizeMarketSymbol(' brk-b ')).toBe('BRK.B')
    expect(normalizeMarketSymbol('BRK.B')).toBe('BRK.B')
    expect(isValidMarketSymbol('brk-b')).toBe(true)
  })

  it('preserves futures while rejecting unsafe shapes', () => {
    expect(normalizeMarketSymbol('es=f')).toBe('ES=F')
    expect(isValidMarketSymbol('ES=F')).toBe(true)
    expect(isValidMarketSymbol('../AAPL')).toBe(false)
    expect(isValidMarketSymbol('AAPL,MSFT')).toBe(false)
  })
})
