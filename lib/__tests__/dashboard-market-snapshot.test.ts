import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDashboardMarketSnapshot,
  readDashboardMarketSnapshotResponse,
} from '@/lib/dashboard-market-snapshot'
import {
  DASHBOARD_INDEX_SYMBOLS,
  DASHBOARD_STOCK_SYMBOLS,
} from '@/lib/dashboard-fixed-panels'
import { FOREX_BOND_SYMBOLS } from '@/lib/forex-bonds-panel'

const CAPTURED_AT = '2026-08-09T14:30:00.000Z'

function response(
  kind: 'fast' | 'slow',
  body: unknown,
  options: { capturedAt?: string | null; degraded?: string } = {},
) {
  const headers = new Headers({
    'content-type': 'application/json',
    'X-Snapshot': kind,
  })
  const capturedAt = options.capturedAt === undefined
    ? CAPTURED_AT
    : options.capturedAt
  if (capturedAt !== null) {
    headers.set('X-Snapshot-Captured-At', capturedAt)
  }
  if (options.degraded) {
    headers.set('X-Snapshot-Degraded', options.degraded)
  }
  return new Response(JSON.stringify(body), { headers })
}

function completeFastBody() {
  return {
    gainers: { premarket: [], cash: [], afterhours: [], currentSession: 'cash' },
    losers: { premarket: [], cash: [], afterhours: [], currentSession: 'cash' },
    stocks: DASHBOARD_STOCK_SYMBOLS.map((symbol) => ({
      symbol,
      name: symbol,
      price: 100,
      change: 1,
      changePercent: 1,
    })),
    sparklineIndices: DASHBOARD_INDEX_SYMBOLS.map((symbol) => ({
      symbol,
      name: symbol,
      currentPrice: 100,
      priceChange: 1,
      priceChangePercent: 1,
      yesterdayChangePercent: null,
      priceHistory: [],
      priceTimestamps: [],
      yesterdayOHLC: [],
      todayOHLC: [],
      previousClose: null,
      todayStartIndex: null,
    })),
  }
}

function forexBondPanel() {
  return FOREX_BOND_SYMBOLS.map((symbol) => ({
    symbol,
    name: symbol,
    price: 1,
    change: 0,
    changesPercentage: 0,
  }))
}

function completeSlowBody() {
  return {
    esFutures: null,
    futures: [],
    futuresWithHistory: [],
    sectors: [],
    economicEvents: [],
    marketNews: [],
    earnings: [],
    earningsTotalCount: 0,
    sp500GainerSparklines: [],
    sp500LoserSparklines: [],
    metaSparkline: null,
    xlbSparkline: null,
    forexBonds: forexBondPanel(),
    largeInsiderTrades: [],
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard market snapshot response boundary', () => {
  it('applies complete fixed panels while allowing empty index candle arrays', async () => {
    const result = await readDashboardMarketSnapshotResponse(
      'fast',
      response('fast', completeFastBody()),
    )

    expect(result.data).toEqual(completeFastBody())
    expect(result.appliedSections).toEqual([
      'gainers',
      'losers',
      'stocks',
      'sparklineIndices',
    ])
    expect(result.degradedSections).toEqual([])
    expect(result.capturedAt).toBe(CAPTURED_AT)
    expect(result.data.sparklineIndices).toHaveLength(
      DASHBOARD_INDEX_SYMBOLS.length,
    )
    expect(result.data.sparklineIndices?.every(
      (index) =>
        index.priceHistory.length === 0 &&
        index.yesterdayOHLC.length === 0 &&
        index.todayOHLC.length === 0,
    )).toBe(true)
  })

  it.each([
    ['empty stock', 'stocks', []],
    [
      'partial stock',
      'stocks',
      completeFastBody().stocks.slice(0, -1),
    ],
    [
      'duplicate stock',
      'stocks',
      completeFastBody().stocks.map((row, index) =>
        index === DASHBOARD_STOCK_SYMBOLS.length - 1
          ? { ...row, symbol: 'AAPL' }
          : row,
      ),
    ],
    [
      'unexpected stock',
      'stocks',
      completeFastBody().stocks.map((row, index) =>
        index === DASHBOARD_STOCK_SYMBOLS.length - 1
          ? { ...row, symbol: 'NFLX' }
          : row,
      ),
    ],
    ['empty index', 'sparklineIndices', []],
    [
      'partial index',
      'sparklineIndices',
      completeFastBody().sparklineIndices.slice(0, -1),
    ],
    [
      'duplicate index',
      'sparklineIndices',
      completeFastBody().sparklineIndices.map((row, index) =>
        index === DASHBOARD_INDEX_SYMBOLS.length - 1
          ? { ...row, symbol: '^GSPC' }
          : row,
      ),
    ],
    [
      'unexpected index',
      'sparklineIndices',
      completeFastBody().sparklineIndices.map((row, index) =>
        index === DASHBOARD_INDEX_SYMBOLS.length - 1
          ? { ...row, symbol: '^NDX' }
          : row,
      ),
    ],
  ] as const)(
    'degrades a %s fixed panel without blocking valid siblings',
    async (_label, section, panel) => {
      const result = await readDashboardMarketSnapshotResponse(
        'fast',
        response('fast', { ...completeFastBody(), [section]: panel }),
      )

      expect(result.data).not.toHaveProperty(section)
      expect(result.degradedSections).toEqual([section])
      expect(result.appliedSections).toHaveLength(3)
    },
  )

  it('enforces aligned index history metadata and permits the inclusive producer boundary', async () => {
    const validIndices = completeFastBody().sparklineIndices.map(
      (row, index) =>
        index === 0
          ? {
              ...row,
              priceHistory: [99],
              priceTimestamps: ['2026-08-09 09:30:00'],
              todayStartIndex: 1,
            }
          : row,
    )
    const valid = await readDashboardMarketSnapshotResponse(
      'fast',
      response('fast', {
        ...completeFastBody(),
        sparklineIndices: validIndices,
      }),
    )
    expect(valid.data).toHaveProperty('sparklineIndices', validIndices)

    for (const invalidFirst of [
      { ...validIndices[0], priceTimestamps: [] },
      { ...validIndices[0], todayStartIndex: 2 },
    ]) {
      const invalid = await readDashboardMarketSnapshotResponse(
        'fast',
        response('fast', {
          ...completeFastBody(),
          sparklineIndices: [invalidFirst, ...validIndices.slice(1)],
        }),
      )
      expect(invalid.data).not.toHaveProperty('sparklineIndices')
      expect(invalid.degradedSections).toContain('sparklineIndices')
    }
  })

  it('strips declared degraded fields even when a slow response carries stale fallback data', async () => {
    const body = {
      ...completeSlowBody(),
      sectors: [{ sector: 'Stale Technology' }],
      marketNews: [{
        title: 'Healthy headline',
        text: '',
        url: 'https://example.test/story',
        publishedDate: CAPTURED_AT,
        site: 'Example',
      }],
    }
    const result = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', body, { degraded: 'sectors' }),
    )

    expect(result.data).not.toHaveProperty('sectors')
    expect(result.data).toHaveProperty('marketNews', body.marketNews)
    expect(result.degradedSections).toEqual(['sectors'])
  })

  it('treats an omitted allowlisted field as degraded even if the header forgot it', async () => {
    const body: Record<string, unknown> = { ...completeFastBody() }
    delete body.stocks
    const result = await readDashboardMarketSnapshotResponse(
      'fast',
      response('fast', body),
    )

    expect(result.data).not.toHaveProperty('stocks')
    expect(result.degradedSections).toEqual(['stocks'])
  })

  it('degrades malformed allowlisted values while applying valid siblings', async () => {
    const fast = await readDashboardMarketSnapshotResponse(
      'fast',
      response('fast', {
        ...completeFastBody(),
        gainers: null,
        stocks: {},
      }),
    )

    expect(fast.data).not.toHaveProperty('gainers')
    expect(fast.data).not.toHaveProperty('stocks')
    expect(fast.data).toHaveProperty('losers')
    expect(fast.data.sparklineIndices).toHaveLength(
      DASHBOARD_INDEX_SYMBOLS.length,
    )
    expect(fast.degradedSections).toEqual(['gainers', 'stocks'])

    const slow = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', {
        ...completeSlowBody(),
        sectors: null,
        earningsTotalCount: Number.NaN,
        marketNews: [{ title: 'missing required fields' }],
      }),
    )

    expect(slow.data).not.toHaveProperty('sectors')
    expect(slow.data).not.toHaveProperty('earningsTotalCount')
    expect(slow.data).not.toHaveProperty('marketNews')
    expect(slow.data).toHaveProperty('earnings', [])
    expect(slow.degradedSections).toEqual([
      'sectors',
      'marketNews',
      'earningsTotalCount',
    ])
  })

  it('accepts finite coherent negative futures quotes and histories', async () => {
    const body = {
      ...completeSlowBody(),
      esFutures: {
        currentPrice: -10,
        priceChange: -2,
        priceChangePercent: -16.67,
        date: '2026-08-09',
        priceHistory: [{
          date: '2026-08-08',
          open: -12,
          high: -9,
          low: -15,
          close: -10,
        }],
      },
      futures: [{
        symbol: 'CL=F',
        name: 'Crude Oil',
        price: -37.63,
        change: -55.9,
        changesPercentage: -305,
        ytdPriceHistory: [
          { date: '2026-01-02', close: -20 },
          { date: '2026-08-09', close: -37.63 },
        ],
        ytdChangePercent: 88.15,
      }],
      futuresWithHistory: [{
        symbol: 'CL=F',
        name: 'Crude Oil',
        currentPrice: -37.63,
        priceChange: -55.9,
        priceChangePercent: -305,
        date: '2026-08-09',
        priceHistory: [{
          date: '2026-08-09',
          open: -38,
          high: -35,
          low: -41,
          close: -37.63,
        }],
      }],
    }

    const result = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', body),
    )

    expect(result.degradedSections).toEqual([])
    expect(result.data).toMatchObject({
      esFutures: { currentPrice: -10 },
      futures: [{ price: -37.63 }],
      futuresWithHistory: [{ currentPrice: -37.63 }],
    })
  })

  it('degrades zero futures quotes and incoherent negative histories', async () => {
    const zeroQuote = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', {
        ...completeSlowBody(),
        futures: [{
          symbol: 'CL=F',
          name: 'Crude Oil',
          price: 0,
          change: 1,
          changesPercentage: 1,
          ytdPriceHistory: [],
          ytdChangePercent: 0,
        }],
      }),
    )
    expect(zeroQuote.data).not.toHaveProperty('futures')
    expect(zeroQuote.degradedSections).toEqual(['futures'])

    const incoherentHistory = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', {
        ...completeSlowBody(),
        futuresWithHistory: [{
          symbol: 'CL=F',
          name: 'Crude Oil',
          currentPrice: -37.63,
          priceChange: -1,
          priceChangePercent: -1,
          date: '2026-08-09',
          priceHistory: [{
            date: '2026-08-09',
            open: -38,
            high: -40,
            low: -41,
            close: -37.63,
          }],
        }],
      }),
    )
    expect(incoherentHistory.data).not.toHaveProperty('futuresWithHistory')
    expect(incoherentHistory.degradedSections).toEqual([
      'futuresWithHistory',
    ])
  })

  it.each([
    ['empty', []],
    ['partial', forexBondPanel().slice(0, -1)],
    [
      'duplicate',
      forexBondPanel().map((row, index) =>
        index === FOREX_BOND_SYMBOLS.length - 1
          ? { ...row, symbol: 'EURUSD' }
          : row,
      ),
    ],
    [
      'unexpected',
      forexBondPanel().map((row, index) =>
        index === FOREX_BOND_SYMBOLS.length - 1
          ? { ...row, symbol: 'AUDUSD' }
          : row,
      ),
    ],
  ] as const)('degrades an %s forex/bond panel', async (_label, panel) => {
    const result = await readDashboardMarketSnapshotResponse(
      'slow',
      response('slow', { ...completeSlowBody(), forexBonds: panel }),
    )

    expect(result.data).not.toHaveProperty('forexBonds')
    expect(result.degradedSections).toEqual(['forexBonds'])
    expect(result.data).toHaveProperty('marketNews', [])
  })

  it('fails closed for unknown degraded fields and invalid provenance', async () => {
    await expect(
      readDashboardMarketSnapshotResponse(
        'fast',
        response('fast', completeFastBody(), { degraded: 'mystery-field' }),
      ),
    ).rejects.toThrow('unknown degraded section')

    await expect(
      readDashboardMarketSnapshotResponse(
        'fast',
        response('fast', completeFastBody(), {
          capturedAt: '2026-08-09T10:30:00.000-04:00',
        }),
      ),
    ).rejects.toThrow('invalid fast capture time')

    await expect(
      readDashboardMarketSnapshotResponse(
        'fast',
        response('slow', completeFastBody()),
      ),
    ).rejects.toThrow('identity did not match')
  })

  it('bounds the body read with a timeout signal', async () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    let requestSignal: AbortSignal | undefined
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          'abort',
          () => reject(requestSignal?.reason),
          { once: true },
        )
      })
    }) as typeof fetch

    const pending = fetchDashboardMarketSnapshot('fast', {
      signal: parent.signal,
      timeoutMs: 1_000,
      fetchImpl,
    })
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(requestSignal?.aborted).toBe(true)
  })

  it('times out even when the fetch promise ignores its abort signal', async () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    let resolveFetch!: (value: Response) => void
    const ignoredFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchImpl = vi.fn(() => ignoredFetch) as typeof fetch

    const pending = fetchDashboardMarketSnapshot('fast', {
      signal: parent.signal,
      timeoutMs: 1_000,
      fetchImpl,
    })
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection

    resolveFetch(response('fast', completeFastBody()))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('times out an abort-ignoring response body and fences its late value', async () => {
    vi.useFakeTimers()
    const parent = new AbortController()
    let resolveBody!: (value: unknown) => void
    const body = new Promise<unknown>((resolve) => {
      resolveBody = resolve
    })
    const bodyResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'X-Snapshot': 'fast',
        'X-Snapshot-Captured-At': CAPTURED_AT,
      }),
      json: () => body,
    } as Response
    const fetchImpl = vi.fn().mockResolvedValue(bodyResponse) as typeof fetch

    const pending = fetchDashboardMarketSnapshot('fast', {
      signal: parent.signal,
      timeoutMs: 1_000,
      fetchImpl,
    })
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection

    resolveBody(completeFastBody())
    await Promise.resolve()
    await Promise.resolve()
  })

  it('links caller cancellation into the request without waiting for the deadline', async () => {
    const parent = new AbortController()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    }) as typeof fetch

    const pending = fetchDashboardMarketSnapshot('fast', {
      signal: parent.signal,
      fetchImpl,
    })
    parent.abort(new DOMException('left page', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
