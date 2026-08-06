import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  MassiveProvider: vi.fn(),
  getTradingDate: vi.fn(),
  getIntraday: vi.fn(),
  getHistoricalDaily: vi.fn(),
  getQuote: vi.fn(),
}))

vi.mock('@/lib/providers/massive', () => ({
  MassiveProvider: mocks.MassiveProvider,
}))

vi.mock('@/lib/market-hours', () => ({
  getTradingDate: mocks.getTradingDate,
}))

import { GET } from '@/app/api/replay/[symbol]/route'

function candle(date: string, close: number, timestampMs?: number) {
  return {
    date,
    timestampMs: timestampMs ?? new Date(`${date.slice(0, 10)}T16:00:00-04:00`).getTime(),
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1_000,
  }
}

function replayRequest(
  symbol: string,
  query: Record<string, string> = {},
) {
  const search = new URLSearchParams(query)
  const request = new Request(
    `http://localhost/api/replay/${encodeURIComponent(symbol)}?${search.toString()}`,
  )

  return GET(request, { params: Promise.resolve({ symbol }) })
}

describe('replay route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    mocks.getTradingDate.mockReturnValue('2026-08-06')
    mocks.getIntraday.mockResolvedValue([])
    mocks.getHistoricalDaily.mockResolvedValue([])
    mocks.getQuote.mockResolvedValue(null)
    mocks.MassiveProvider.mockImplementation(function MassiveProviderMock() {
      return {
        getIntraday: mocks.getIntraday,
        getHistoricalDaily: mocks.getHistoricalDaily,
        getQuote: mocks.getQuote,
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('uses the last daily candle strictly before the replay date for class-share symbols', async () => {
    const replayTimestamp = new Date('2026-07-10T09:30:30-04:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-07-10 09:30:30', 102, replayTimestamp),
    ])
    mocks.getHistoricalDaily.mockResolvedValue([
      candle('2026-07-08', 90),
      candle('2026-07-10', 110),
      candle('2026-07-09', 100),
    ])

    const response = await replayRequest('brk-b', {
      date: '2026-07-10',
      from: '09:30',
      to: '09:31',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      candles: [{
        time: Math.floor(replayTimestamp / 1_000),
        open: 101,
        high: 103,
        low: 100,
        close: 102,
        volume: 1_000,
      }],
      previousClose: 100,
      startTime: Math.floor(new Date('2026-07-10T09:30:00-04:00').getTime() / 1_000),
      endTime: Math.floor(new Date('2026-07-10T09:31:00-04:00').getTime() / 1_000),
    })
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'BRK.B',
      1,
      'second',
      '2026-07-10',
      '2026-07-10',
    )
    expect(mocks.getHistoricalDaily).toHaveBeenCalledWith(
      'BRK.B',
      '2026-06-26',
      '2026-07-10',
    )
    expect(mocks.getQuote).not.toHaveBeenCalled()
  })

  it('derives the provider and baseline date from full local-ISO bounds', async () => {
    const replayTimestamp = new Date('2026-07-10T09:30:30-04:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-07-10 09:30:30', 102, replayTimestamp),
    ])
    mocks.getHistoricalDaily.mockResolvedValue([
      candle('2026-07-09', 100),
      candle('2026-07-10', 102),
    ])

    const response = await replayRequest('IBM', {
      from: '2026-07-10T09:30:00',
      to: '2026-07-10T09:31:00',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      previousClose: 100,
      startTime: Math.floor(new Date('2026-07-10T09:30:00-04:00').getTime() / 1_000),
      endTime: Math.floor(new Date('2026-07-10T09:31:00-04:00').getTime() / 1_000),
    })
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'IBM',
      1,
      'second',
      '2026-07-10',
      '2026-07-10',
    )
    expect(mocks.getHistoricalDaily).toHaveBeenCalledWith(
      'IBM',
      '2026-06-26',
      '2026-07-10',
    )
  })

  it('uses the full bound local date when the other bound is a short time', async () => {
    const replayTimestamp = new Date('2026-12-18T09:30:30-05:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-12-18 09:30:30', 52, replayTimestamp),
    ])

    const response = await replayRequest('KO', {
      from: '09:30',
      to: '2026-12-18T09:31:00.000',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      startTime: Math.floor(new Date('2026-12-18T09:30:00-05:00').getTime() / 1_000),
      endTime: Math.floor(new Date('2026-12-18T09:31:00-05:00').getTime() / 1_000),
    })
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      'KO',
      1,
      'second',
      '2026-12-18',
      '2026-12-18',
    )
  })

  it('rejects full replay bounds that cross trading dates', async () => {
    const response = await replayRequest('ORCL', {
      from: '2026-07-10T15:59:00',
      to: '2026-07-11T09:31:00',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Replay bounds must use the same trading date',
    })
    expect(mocks.MassiveProvider).not.toHaveBeenCalled()
  })

  it('rejects an explicit replay date that disagrees with full bounds', async () => {
    const response = await replayRequest('ADBE', {
      date: '2026-07-09',
      from: '2026-07-10T09:30:00',
      to: '2026-07-10T09:31:00',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Replay date does not match from/to bounds',
    })
    expect(mocks.MassiveProvider).not.toHaveBeenCalled()
  })

  it('rejects an impossible date embedded in a full replay bound', async () => {
    const response = await replayRequest('CRM', {
      from: '2026-02-30T09:30:00',
      to: '2026-02-30T09:31:00',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid from/to date' })
    expect(mocks.MassiveProvider).not.toHaveBeenCalled()
  })

  it('returns null instead of borrowing a current quote when prior history is unavailable', async () => {
    mocks.getHistoricalDaily.mockResolvedValue([
      candle('2026-07-10', 110),
    ])
    mocks.getQuote.mockResolvedValue({ previousClose: 999 })

    const response = await replayRequest('BF.B', {
      date: '2026-07-10',
      from: '09:30',
      to: '09:31',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ previousClose: null })
    expect(mocks.getQuote).not.toHaveBeenCalled()
  })

  it('expires current-session cache entries quickly without letting requestId bypass them', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T14:00:00Z'))
    mocks.getIntraday.mockResolvedValue([
      candle(
        '2026-08-06 09:30:30',
        200,
        new Date('2026-08-06T09:30:30-04:00').getTime(),
      ),
    ])
    mocks.getHistoricalDaily.mockResolvedValue([
      candle('2026-08-05', 199),
      candle('2026-08-06', 200),
    ])

    const query = {
      date: '2026-08-06',
      from: '09:30',
      to: '10:00',
    }

    expect((await replayRequest('MSFT', query)).status).toBe(200)
    expect((await replayRequest('MSFT', query)).status).toBe(200)
    expect(mocks.getIntraday).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(29_999)
    expect((await replayRequest('MSFT', query)).status).toBe(200)
    expect(mocks.getIntraday).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2)
    expect((await replayRequest('MSFT', query)).status).toBe(200)
    expect(mocks.getIntraday).toHaveBeenCalledTimes(2)

    expect((await replayRequest('MSFT', { ...query, requestId: 'retry-1' })).status).toBe(200)
    expect((await replayRequest('MSFT', { ...query, requestId: 'retry-2' })).status).toBe(200)
    expect(mocks.getIntraday).toHaveBeenCalledTimes(2)
  })

  it('does not indefinitely cache an empty historical replay window', async () => {
    const query = {
      date: '2026-07-10',
      from: '09:30',
      to: '09:31',
    }

    const emptyResponse = await replayRequest('TSLA', query)
    expect(await emptyResponse.json()).toMatchObject({ candles: [] })

    const recoveredTimestamp = new Date('2026-07-10T09:30:30-04:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-07-10 09:30:30', 250, recoveredTimestamp),
    ])

    const recoveredResponse = await replayRequest('TSLA', query)
    expect(await recoveredResponse.json()).toMatchObject({
      candles: [{ time: Math.floor(recoveredTimestamp / 1_000), close: 250 }],
    })
    expect(mocks.getIntraday).toHaveBeenCalledTimes(2)
  })

  it('does not indefinitely cache candles with a missing historical baseline', async () => {
    const replayTimestamp = new Date('2026-07-10T09:30:30-04:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-07-10 09:30:30', 250, replayTimestamp),
    ])
    mocks.getHistoricalDaily
      .mockResolvedValueOnce([candle('2026-07-10', 250)])
      .mockResolvedValueOnce([
        candle('2026-07-09', 240),
        candle('2026-07-10', 250),
      ])

    const query = { date: '2026-07-10', from: '09:30', to: '09:31' }
    expect(await (await replayRequest('META', query)).json()).toMatchObject({
      previousClose: null,
    })
    expect(await (await replayRequest('META', query)).json()).toMatchObject({
      previousClose: 240,
    })
    expect(mocks.getIntraday).toHaveBeenCalledTimes(2)
  })

  it('preserves an early-close window while excluding its exact to-boundary', async () => {
    const sessionStart = new Date('2026-11-27T09:30:00-05:00').getTime()
    const includedTimestamp = new Date('2026-11-27T12:59:59-05:00').getTime()
    const closingBoundary = new Date('2026-11-27T13:00:00-05:00').getTime()
    mocks.getIntraday.mockResolvedValue([
      candle('2026-11-27 12:59:59', 299, includedTimestamp),
      candle('2026-11-27 13:00:00', 300, closingBoundary),
    ])

    const response = await replayRequest('AMZN', {
      date: '2026-11-27',
      from: '09:30',
      to: '13:00',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      candles: [{
        time: Math.floor(includedTimestamp / 1_000),
        close: 299,
      }],
      startTime: Math.floor(sessionStart / 1_000),
      endTime: Math.floor(closingBoundary / 1_000),
    })
  })

  it('rejects replay when its second-level provider credential is unavailable', async () => {
    vi.stubEnv('MASSIVE_API_KEY', '')

    const response = await replayRequest('NVDA', {
      date: '2026-07-10',
      from: '09:30',
      to: '09:31',
    })

    expect(response.status).toBe(501)
    expect(await response.json()).toEqual({
      error: 'Second-level replay requires MASSIVE_API_KEY.',
      code: 'UNSUPPORTED_REPLAY_PROVIDER',
    })
    expect(mocks.MassiveProvider).not.toHaveBeenCalled()
  })

  it('rejects malformed symbols and impossible dates before touching the provider', async () => {
    const invalidSymbol = await replayRequest('AAPL<script>', {
      date: '2026-07-10',
    })
    const invalidDate = await replayRequest('AAPL', {
      date: '2026-02-30',
    })

    expect(invalidSymbol.status).toBe(400)
    expect(await invalidSymbol.json()).toEqual({ error: 'Invalid symbol' })
    expect(invalidDate.status).toBe(400)
    expect(await invalidDate.json()).toEqual({ error: 'Invalid date' })
    expect(mocks.MassiveProvider).not.toHaveBeenCalled()
  })
})
