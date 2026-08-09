import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_WATCHLIST_CACHE_KEY,
  createWatchlistIdempotencyKey,
  fingerprintLocalWatchlist,
  parseAccountWatchlistReadResponse,
  parseAccountWatchlistSyncResponse,
  readCachedAccountWatchlist,
  writeCachedAccountWatchlist,
  type CachedAccountWatchlist,
} from '@/lib/dashboard/account-watchlist-client'

const timestamp = '2026-08-09T13:00:00.000Z'
const USER_IDS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
] as const

function entry(
  userId: string,
  touchedAt: number,
  overrides: Partial<CachedAccountWatchlist> = {},
): CachedAccountWatchlist {
  return {
    userId,
    snapshot: {
      symbols: ['AAPL'],
      revision: 2,
      syncInitializedAt: timestamp,
    },
    mergedLocalFingerprint: '["AAPL"]',
    pendingCommand: null,
    touchedAt,
    ...overrides,
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    values,
  }
}

describe('account watchlist browser contract', () => {
  it('parses exact private read and success/conflict response shapes', () => {
    expect(parseAccountWatchlistReadResponse({
      watchlist: {
        symbols: null,
        revision: 0,
        syncInitializedAt: timestamp,
      },
    })).toEqual({
      symbols: null,
      revision: 0,
      syncInitializedAt: timestamp,
    })

    expect(parseAccountWatchlistSyncResponse({
      watchlist: {
        symbols: ['AAPL', 'BRK.B'],
        revision: 3,
        syncInitializedAt: timestamp,
      },
      disposition: 'conflict',
      droppedSymbols: ['NVDA'],
      error: 'changed',
      code: 'WATCHLIST_REVISION_CONFLICT',
    })).toEqual({
      watchlist: {
        symbols: ['AAPL', 'BRK.B'],
        revision: 3,
        syncInitializedAt: timestamp,
      },
      disposition: 'conflict',
      droppedSymbols: ['NVDA'],
    })
  })

  it.each([
    null,
    {},
    { watchlist: { symbols: [], revision: 0, syncInitializedAt: timestamp }, extra: true },
    { watchlist: { symbols: ['brk-b'], revision: 0, syncInitializedAt: timestamp } },
  ])('rejects malformed read payload %#', (value) => {
    expect(() => parseAccountWatchlistReadResponse(value)).toThrow()
  })

  it.each([
    {},
    { watchlist: {}, disposition: 'applied', droppedSymbols: [] },
    {
      watchlist: { symbols: [], revision: 0, syncInitializedAt: timestamp },
      disposition: 'unknown',
      droppedSymbols: [],
    },
    {
      watchlist: { symbols: [], revision: 0, syncInitializedAt: timestamp },
      disposition: 'applied',
      droppedSymbols: ['ES=F'],
    },
    {
      watchlist: { symbols: [], revision: 0, syncInitializedAt: timestamp },
      disposition: 'applied',
      droppedSymbols: [],
      error: 'unexpected',
      code: 'WATCHLIST_REVISION_CONFLICT',
    },
    {
      watchlist: { symbols: [], revision: 0, syncInitializedAt: timestamp },
      disposition: 'conflict',
      droppedSymbols: [],
      error: 'changed',
      code: 'WRONG_CONFLICT',
    },
  ])('rejects malformed sync payload %#', (value) => {
    expect(() => parseAccountWatchlistSyncResponse(value)).toThrow()
  })
})

describe('account watchlist browser cache', () => {
  it('keeps account state separate, bounded to the three most-recent users', () => {
    const storage = memoryStorage()
    expect(writeCachedAccountWatchlist(storage, entry(USER_IDS[0], 1))).toBe(true)
    expect(writeCachedAccountWatchlist(storage, entry(USER_IDS[1], 2))).toBe(true)
    expect(writeCachedAccountWatchlist(storage, entry(USER_IDS[2], 3))).toBe(true)
    expect(writeCachedAccountWatchlist(storage, entry(USER_IDS[3], 4))).toBe(true)

    expect(readCachedAccountWatchlist(storage, USER_IDS[0])).toBeNull()
    expect(readCachedAccountWatchlist(storage, USER_IDS[3]))
      .toEqual(entry(USER_IDS[3], 4))
    const persisted = JSON.parse(storage.values.get(ACCOUNT_WATCHLIST_CACHE_KEY)!)
    expect(persisted.accounts.map((candidate: { userId: string }) => candidate.userId))
      .toEqual([USER_IDS[3], USER_IDS[2], USER_IDS[1]])
  })

  it('preserves an ambiguous command receipt without touching anonymous preferences', () => {
    const storage = memoryStorage({
      'the-intraday:dashboard-preferences:v1': '{"anonymous":true}',
    })
    const cached = entry(USER_IDS[0], 10, {
      pendingCommand: {
        mode: 'replace',
        symbols: [],
        expectedRevision: 2,
        idempotencyKey: 'watchlist:retry-command-1',
      },
    })

    expect(writeCachedAccountWatchlist(storage, cached)).toBe(true)
    expect(readCachedAccountWatchlist(storage, USER_IDS[0])).toEqual(cached)
    expect(storage.values.get('the-intraday:dashboard-preferences:v1'))
      .toBe('{"anonymous":true}')
  })

  it('fails closed on unavailable storage and malformed/cross-account data', () => {
    const denied = {
      getItem: vi.fn(() => { throw new Error('denied') }),
      setItem: vi.fn(() => { throw new Error('denied') }),
    }
    expect(readCachedAccountWatchlist(denied, USER_IDS[0])).toBeNull()
    expect(writeCachedAccountWatchlist(denied, entry(USER_IDS[0], 1))).toBe(false)

    const malformed = memoryStorage({
      [ACCOUNT_WATCHLIST_CACHE_KEY]: JSON.stringify({
        version: 1,
        accounts: [entry(USER_IDS[0], 1), entry(USER_IDS[0], 2)],
      }),
    })
    expect(readCachedAccountWatchlist(malformed, USER_IDS[0])).toBeNull()
    expect(writeCachedAccountWatchlist(
      memoryStorage(),
      entry('not-a-uuid', 1),
    )).toBe(false)
  })

  it('canonicalizes local fingerprints and creates bounded receipt keys', () => {
    expect(fingerprintLocalWatchlist([' brk-b ', 'AAPL', 'BRK.B']))
      .toBe('["BRK.B","AAPL"]')
    expect(fingerprintLocalWatchlist(null)).toBe('null')

    const key = createWatchlistIdempotencyKey()
    expect(key).toMatch(/^watchlist:[A-Za-z0-9._:-]+$/)
    expect(key.length).toBeLessThanOrEqual(128)
  })
})
