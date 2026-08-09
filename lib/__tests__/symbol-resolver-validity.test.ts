import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LookupResult = {
  data: { symbol: string } | null
  error: { message: string; code?: string } | null
}

const mocks = vi.hoisted(() => {
  const results: Record<string, unknown[]> = {
    us_stocks: [],
    sp500_constituents: [],
  }
  const seenSymbols: Array<{ table: string; symbol: string }> = []

  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'symbol' && typeof value === 'string') {
          seenSymbols.push({ table, symbol: value })
        }
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        if (column === 'symbol') {
          values.forEach((value) => {
            if (typeof value === 'string') {
              seenSymbols.push({ table, symbol: value })
            }
          })
        }
        return query
      }),
      limit: vi.fn(() => query),
      abortSignal: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        const next = results[table]?.shift()
        if (next instanceof Error) {
          throw next
        }
        return next ?? { data: null, error: null }
      }),
    }
    return query
  })

  return {
    createPublicClient: vi.fn(() => ({ from })),
    from,
    results,
    seenSymbols,
  }
})

vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: mocks.createPublicClient,
}))

const found = (symbol: string): LookupResult => ({
  data: { symbol },
  error: null,
})

const missing = (): LookupResult => ({ data: null, error: null })

const failed = (message: string): LookupResult => ({
  data: null,
  error: { message, code: '503' },
})

async function flushMicrotasks(turns = 4): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

describe('stock symbol validity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.resetModules()
    mocks.results.us_stocks.length = 0
    mocks.results.sp500_constituents.length = 0
    mocks.seenSymbols.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('caches valid and authoritative not-found results', async () => {
    mocks.results.us_stocks.push(found('AAPL'))
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    await expect(getSymbolValidity('aapl')).resolves.toBe('valid')
    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
    expect(mocks.from).toHaveBeenCalledTimes(1)

    mocks.results.us_stocks.push(missing())
    mocks.results.sp500_constituents.push(missing())
    await expect(getSymbolValidity('ZZZZ')).resolves.toBe('not_found')
    await expect(getSymbolValidity('zzzz')).resolves.toBe('not_found')
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })

  it('does not cache a transient primary failure as not found', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.results.us_stocks.push(failed('registry unavailable'), found('SOFI'))
    mocks.results.sp500_constituents.push(missing())
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    await expect(getSymbolValidity('SOFI')).resolves.toBe('unavailable')
    await expect(getSymbolValidity('SOFI')).resolves.toBe('valid')
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })

  it('does not cache a transient fallback failure as not found', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.results.us_stocks.push(missing(), found('AAPL'))
    mocks.results.sp500_constituents.push(failed('fallback unavailable'))
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    await expect(getSymbolValidity('AAPL')).resolves.toBe('unavailable')
    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })

  it('accepts a fallback hit even when the primary registry failed', async () => {
    mocks.results.us_stocks.push(failed('registry unavailable'))
    mocks.results.sp500_constituents.push(found('AAPL'))
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
  })

  it('coalesces concurrent outages but retries after their shared rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolvePrimary!: (result: LookupResult) => void
    const primary = new Promise<LookupResult>((resolve) => {
      resolvePrimary = resolve
    })
    mocks.results.us_stocks.push(primary, found('AAPL'))
    mocks.results.sp500_constituents.push(missing())
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    const first = getSymbolValidity('AAPL')
    const second = getSymbolValidity('aapl')
    resolvePrimary(failed('registry unavailable'))

    await expect(Promise.all([first, second])).resolves.toEqual([
      'unavailable',
      'unavailable',
    ])
    expect(mocks.from).toHaveBeenCalledTimes(2)

    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
    expect(mocks.from).toHaveBeenCalledTimes(3)
  })

  it('returns unavailable on an abort-resistant timeout and retries without accepting the late result', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T15:00:00.000Z')
    let resolveExpired!: (result: LookupResult) => void
    const expired = new Promise<LookupResult>((resolve) => {
      resolveExpired = resolve
    })
    mocks.results.us_stocks.push(expired, found('AAPL'))
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')
    const { SYMBOL_VALIDITY_LOAD_TIMEOUT_MS } = await import(
      '@/lib/symbol-validity-cache'
    )

    const timedOut = getSymbolValidity('AAPL')
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(SYMBOL_VALIDITY_LOAD_TIMEOUT_MS)
    await expect(timedOut).resolves.toBe('unavailable')

    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
    resolveExpired(missing())
    await flushMicrotasks()
    await expect(getSymbolValidity('AAPL')).resolves.toBe('valid')
    expect(mocks.from).toHaveBeenCalledTimes(2)
  })

  it('rejects unsafe shapes without touching the database and queries canonical plus FMP aliases', async () => {
    mocks.results.us_stocks.push(found('BRK-A'), found('BF-B'))
    const { getSymbolValidity } = await import('@/lib/symbol-resolver')

    await expect(getSymbolValidity('../AAPL')).resolves.toBe('not_found')
    expect(mocks.createPublicClient).not.toHaveBeenCalled()

    await expect(getSymbolValidity('brk-a')).resolves.toBe('valid')
    await expect(getSymbolValidity('BF.B')).resolves.toBe('valid')
    expect(mocks.seenSymbols).toEqual(expect.arrayContaining([
      { table: 'us_stocks', symbol: 'BRK.A' },
      { table: 'us_stocks', symbol: 'BRK-A' },
      { table: 'us_stocks', symbol: 'BF.B' },
      { table: 'us_stocks', symbol: 'BF-B' },
    ]))
  })
})
