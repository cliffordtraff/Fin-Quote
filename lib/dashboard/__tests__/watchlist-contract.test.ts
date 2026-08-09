import { describe, expect, it } from 'vitest'
import {
  MAX_WATCHLIST_SYMBOLS,
  normalizeWatchlistSymbols,
  parseAccountWatchlistSnapshot,
  parseAccountWatchlistSyncResult,
} from '@/lib/dashboard/watchlist-contract'

describe('normalizeWatchlistSymbols', () => {
  it('normalizes equity aliases, preserves first occurrence, and rejects derivatives', () => {
    expect(normalizeWatchlistSymbols([
      ' brk-b ',
      'AAPL',
      'BRK.B',
      'es=f',
      'not valid!',
      42,
      'RDS-A',
    ])).toEqual(['BRK.B', 'AAPL', 'RDS.A'])
  })

  it('accepts explicit arrays only and caps output at twenty symbols', () => {
    expect(normalizeWatchlistSymbols(null)).toEqual([])
    expect(normalizeWatchlistSymbols({ 0: 'AAPL' })).toEqual([])

    const symbols = Array.from({ length: 25 }, (_, index) => `T${index}`)
    expect(normalizeWatchlistSymbols(symbols)).toEqual(symbols.slice(0, 20))
    expect(normalizeWatchlistSymbols(symbols)).toHaveLength(MAX_WATCHLIST_SYMBOLS)
  })
})

describe('account watchlist wire parsers', () => {
  it('preserves the semantic difference between default and intentionally empty', () => {
    expect(parseAccountWatchlistSnapshot({
      symbols: null,
      revision: 0,
      sync_initialized_at: '2026-08-09T12:00:00.000Z',
    })).toEqual({
      symbols: null,
      revision: 0,
      syncInitializedAt: '2026-08-09T12:00:00.000Z',
    })

    expect(parseAccountWatchlistSnapshot({
      symbols: [],
      revision: 1,
      sync_initialized_at: '2026-08-09T12:00:00+00:00',
    }).symbols).toEqual([])
  })

  it('parses bounded merge loss explicitly', () => {
    expect(parseAccountWatchlistSyncResult({
      disposition: 'applied',
      symbols: ['AAPL', 'BRK.B'],
      revision: 4,
      sync_initialized_at: '2026-08-09T12:00:00.000Z',
      dropped_symbols: ['MSFT'],
    })).toEqual({
      disposition: 'applied',
      symbols: ['AAPL', 'BRK.B'],
      revision: 4,
      syncInitializedAt: '2026-08-09T12:00:00.000Z',
      droppedSymbols: ['MSFT'],
    })
  })

  it.each([
    { symbols: ['brk-b'], revision: 0, sync_initialized_at: '2026-08-09T12:00:00Z' },
    { symbols: ['AAPL', 'AAPL'], revision: 0, sync_initialized_at: '2026-08-09T12:00:00Z' },
    { symbols: ['ES=F'], revision: 0, sync_initialized_at: '2026-08-09T12:00:00Z' },
    { symbols: null, revision: -1, sync_initialized_at: '2026-08-09T12:00:00Z' },
    { symbols: null, revision: Number.MAX_SAFE_INTEGER + 1, sync_initialized_at: '2026-08-09T12:00:00Z' },
    { symbols: null, revision: 0, sync_initialized_at: 'not-a-date' },
  ])('rejects malformed snapshots %#', (value) => {
    expect(() => parseAccountWatchlistSnapshot(value)).toThrow()
  })
})
