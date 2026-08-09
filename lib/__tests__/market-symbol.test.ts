import { describe, expect, it } from 'vitest'
import {
  getMarketSymbolLookupAliases,
  isValidMarketSymbol,
  isValidStockPageSymbol,
  normalizeMarketSymbol,
  toFmpMarketSymbol,
} from '@/lib/market-symbol'

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

  it('centralizes canonical and FMP class-share aliases', () => {
    expect(toFmpMarketSymbol('BRK.A')).toBe('BRK-A')
    expect(toFmpMarketSymbol('bf-b')).toBe('BF-B')
    expect(toFmpMarketSymbol('AAPL')).toBe('AAPL')
    expect(toFmpMarketSymbol('ES=F')).toBe('ES=F')
    expect(getMarketSymbolLookupAliases('BRK-A')).toEqual(['BRK.A', 'BRK-A'])
    expect(getMarketSymbolLookupAliases('AAPL')).toEqual(['AAPL'])
  })

  it('keeps quote-compatible futures off stock detail routes', () => {
    expect(isValidMarketSymbol('ES=F')).toBe(true)
    expect(isValidStockPageSymbol('ES=F')).toBe(false)
    expect(isValidStockPageSymbol('BRK-A')).toBe(true)
    expect(isValidStockPageSymbol('AAPL')).toBe(true)
  })
})
