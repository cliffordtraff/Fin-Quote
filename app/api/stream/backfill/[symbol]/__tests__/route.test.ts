import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  getIntraday: vi.fn(),
  getQuote: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: mocks.getProvider,
}))

import { GET } from '@/app/api/stream/backfill/[symbol]/route'
import {
  getLiveStreamBackfillAdmissionStateForTests,
  LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS,
  resetLiveStreamBackfillAdmissionForTests,
} from '@/lib/live-stream-backfill-admission'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function backfillRequest(query: string, signal?: AbortSignal) {
  const request = new Request(
    `http://localhost/api/stream/backfill/AAPL?${query}`,
    { signal },
  )
  return GET(request, { params: Promise.resolve({ symbol: 'AAPL' }) })
}

describe('stream backfill provider capability', () => {
  beforeEach(() => {
    resetLiveStreamBackfillAdmissionForTests()
    vi.clearAllMocks()
    mocks.getProvider.mockReturnValue({
      getIntraday: mocks.getIntraday,
      getQuote: mocks.getQuote,
    })
    mocks.getIntraday.mockResolvedValue([])
    mocks.getQuote.mockResolvedValue(null)
  })

  afterEach(() => {
    resetLiveStreamBackfillAdmissionForTests()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([undefined, 'fmp'])('returns typed 501 under %s provider configuration', async (provider) => {
    if (provider) vi.stubEnv('DATA_PROVIDER', provider)
    else vi.stubEnv('DATA_PROVIDER', '')
    vi.stubEnv('MASSIVE_API_KEY', 'available-but-not-selected')

    const response = await backfillRequest('timeframe=1s&lookback=300')

    expect(response.status).toBe(501)
    expect(await response.json()).toEqual({
      error: 'Second-level backfill requires the Massive data provider.',
      code: 'UNSUPPORTED_BACKFILL_PROVIDER',
    })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('requires a Massive credential when the provider is selected', async () => {
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', '')

    const response = await backfillRequest('timeframe=10s&lookback=1800')

    expect(response.status).toBe(501)
    expect(await response.json()).toMatchObject({
      code: 'UNSUPPORTED_BACKFILL_PROVIDER',
    })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it.each(['NaN', '0', '-1', '1.5', 'Infinity'])('rejects invalid lookback %s', async (lookback) => {
    const response = await backfillRequest(`timeframe=1s&lookback=${lookback}`)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'INVALID_BACKFILL_LOOKBACK',
    })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('uses Massive second candles and caps lookback at one hour', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T15:00:00.000Z'))
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    const now = Date.now()
    mocks.getIntraday.mockResolvedValue([
      {
        date: '2026-08-07 09:53:20',
        timestampMs: now - 4_000_000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 10,
      },
      {
        date: '2026-08-07 10:01:40',
        timestampMs: now - 3_500_000,
        open: 101,
        high: 102,
        low: 100,
        close: 101,
        volume: 20,
      },
      {
        date: '2026-08-07 15:00:01',
        timestampMs: now + 1_000,
        open: 999,
        high: 1_000,
        low: 998,
        close: 999,
        volume: 30,
      },
    ])
    mocks.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      previousClose: 98,
      dayHigh: 103,
      dayLow: 97,
    })

    const response = await backfillRequest('timeframe=1s&lookback=99999')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'AAPL',
      1,
      'second',
      String(now - 3_600_000),
      String(now),
      expect.objectContaining({
        failureMode: 'throw',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(mocks.getQuote).toHaveBeenCalledWith('AAPL', expect.objectContaining({
      failureMode: 'throw',
      freshness: 'live',
      signal: expect.any(AbortSignal),
    }))
    expect(body.symbol).toBe('AAPL')
    expect(body.candles).toHaveLength(1)
    expect(body.candles[0]).toMatchObject({ close: 101, volume: 20 })
    expect(body.previousClose).toBe(98)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('distinguishes authoritative empty data from malformed or wrong-symbol data', async () => {
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    mocks.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      price: 100,
      change: 0,
      changesPercentage: 0,
      previousClose: 99,
      dayHigh: 101,
      dayLow: 98,
    })

    const empty = await backfillRequest('timeframe=1s&lookback=300')
    expect(empty.status).toBe(200)
    await expect(empty.json()).resolves.toMatchObject({
      symbol: 'AAPL',
      candles: [],
    })

    mocks.getIntraday.mockResolvedValueOnce([{
      timestampMs: Date.now(),
      open: 100,
      high: 90,
      low: 99,
      close: 101,
      volume: 10,
    }])
    const malformed = await backfillRequest('timeframe=1s&lookback=300')
    expect(malformed.status).toBe(502)
    expect(malformed.headers.get('cache-control')).toBe('private, no-store')

    mocks.getIntraday.mockResolvedValueOnce([])
    mocks.getQuote.mockResolvedValueOnce({ symbol: 'NVDA' })
    const mismatch = await backfillRequest('timeframe=1s&lookback=300')
    expect(mismatch.status).toBe(502)
  })

  it('rejects provider candle arrays above the runtime input budget', async () => {
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    const repeated = {
      timestampMs: Date.now(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
    }
    mocks.getIntraday.mockResolvedValue(Array.from({ length: 4_001 }, () => repeated))
    mocks.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      previousClose: 99,
      dayHigh: 101,
      dayLow: 98,
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await backfillRequest('timeframe=1s&lookback=300')

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    errorSpy.mockRestore()
  })

  it('aborts sibling provider work when either strict read fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    mocks.getIntraday.mockRejectedValueOnce(new Error('aggregate unavailable'))
    mocks.getQuote.mockImplementationOnce((_symbol, options) =>
      new Promise((_resolve, reject) => {
        const signal = options.signal as AbortSignal
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      }),
    )

    const response = await backfillRequest('timeframe=1s&lookback=300')
    expect(response.status).toBe(502)
    const quoteSignal = mocks.getQuote.mock.calls[0][1].signal as AbortSignal
    expect(quoteSignal.aborted).toBe(true)
    errorSpy.mockRestore()
  })

  it('returns a typed deadline without multiplying abort-ignoring provider work', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T15:00:00.000Z'))
    vi.stubEnv('DATA_PROVIDER', 'massive')
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    const candleLoad = deferred<unknown[]>()
    const quoteLoad = deferred<unknown>()
    mocks.getIntraday.mockReturnValueOnce(candleLoad.promise)
    mocks.getQuote.mockReturnValueOnce(quoteLoad.promise)

    const firstResponsePromise = backfillRequest('timeframe=1s&lookback=300')
    await vi.advanceTimersByTimeAsync(LIVE_STREAM_BACKFILL_LOAD_DEADLINE_MS)
    const firstResponse = await firstResponsePromise

    expect(firstResponse.status).toBe(504)
    await expect(firstResponse.json()).resolves.toEqual({
      error: 'Backfill timed out. Please retry.',
      code: 'BACKFILL_DEADLINE_EXCEEDED',
    })
    expect(firstResponse.headers.get('cache-control')).toBe('private, no-store')
    expect(firstResponse.headers.get('retry-after')).toBe('1')
    const candleSignal = mocks.getIntraday.mock.calls[0][5].signal as AbortSignal
    const quoteSignal = mocks.getQuote.mock.calls[0][1].signal as AbortSignal
    expect(candleSignal.aborted).toBe(true)
    expect(quoteSignal.aborted).toBe(true)
    expect(getLiveStreamBackfillAdmissionStateForTests()).toEqual({
      physicalKeys: ['AAPL:1s:300'],
      timedOutKeys: ['AAPL:1s:300'],
    })

    const retryBeforeSettlement = await backfillRequest(
      'timeframe=1s&lookback=300',
    )
    expect(retryBeforeSettlement.status).toBe(504)
    expect(mocks.getIntraday).toHaveBeenCalledTimes(1)
    expect(mocks.getQuote).toHaveBeenCalledTimes(1)

    candleLoad.resolve([])
    quoteLoad.resolve({
      symbol: 'AAPL',
      previousClose: 1,
      dayHigh: 999,
      dayLow: 1,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(getLiveStreamBackfillAdmissionStateForTests().physicalKeys).toEqual([])

    mocks.getIntraday.mockResolvedValueOnce([])
    mocks.getQuote.mockResolvedValueOnce({
      symbol: 'AAPL',
      previousClose: 98,
      dayHigh: 103,
      dayLow: 97,
    })
    const freshResponse = await backfillRequest('timeframe=1s&lookback=300')
    expect(freshResponse.status).toBe(200)
    await expect(freshResponse.json()).resolves.toMatchObject({
      symbol: 'AAPL',
      candles: [],
      previousClose: 98,
    })
    expect(mocks.getIntraday).toHaveBeenCalledTimes(2)
    expect(mocks.getQuote).toHaveBeenCalledTimes(2)
  })
})
