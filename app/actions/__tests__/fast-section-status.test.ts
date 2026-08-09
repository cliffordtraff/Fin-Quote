import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderCandle, ProviderQuote } from '@/lib/providers/types'

const mocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  getIntraday: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: () => ({
    getQuotes: mocks.getQuotes,
    getIntraday: mocks.getIntraday,
  }),
}))

import {
  getSparklineIndicesData,
  getSparklineIndicesDataWithStatus,
} from '@/app/actions/sparkline-indices'
import { getStocksData, getStocksDataWithStatus } from '@/app/actions/stocks'

function quote(symbol: string): ProviderQuote {
  return {
    symbol,
    name: symbol,
    price: 100,
    change: 1,
    changesPercentage: 1,
  }
}

function candle(overrides: Partial<ProviderCandle> = {}): ProviderCandle {
  return {
    date: '2026-08-08 10:00:00',
    timestampMs: Date.UTC(2026, 7, 8, 14),
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1_000,
    ...overrides,
  }
}

const STOCKS = ['AAPL', 'NVDA', 'GOOGL', 'TSLA', 'AMD', 'MSFT', 'META']
const INDICES = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX']

describe('fast fixed-panel status loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getIntraday.mockResolvedValue([])
  })

  it('requires exact one-to-one stock coverage and requests strict transport semantics', async () => {
    const controller = new AbortController()
    mocks.getQuotes.mockResolvedValueOnce(STOCKS.map(quote))

    const result = await getStocksDataWithStatus(controller.signal)

    expect(result).toHaveProperty('stocks')
    expect('stocks' in result ? result.stocks : []).toHaveLength(STOCKS.length)
    expect(mocks.getQuotes).toHaveBeenCalledWith(STOCKS, {
      failureMode: 'throw',
      signal: controller.signal,
    })
  })

  it('reports partial, duplicate, and malformed stock panels as failures', async () => {
    mocks.getQuotes
      .mockResolvedValueOnce(STOCKS.slice(0, -1).map(quote))
      .mockResolvedValueOnce(STOCKS.map((symbol, index) =>
        quote(index === STOCKS.length - 1 ? 'AAPL' : symbol),
      ))
      .mockResolvedValueOnce(STOCKS.map((symbol, index) => ({
        ...quote(symbol),
        price: index === 0 ? Number.NaN : 100,
      })))

    await expect(getStocksDataWithStatus()).resolves.toHaveProperty('error')
    await expect(getStocksDataWithStatus()).resolves.toHaveProperty('error')
    await expect(getStocksDataWithStatus()).resolves.toHaveProperty('error')
  })

  it.each([0, -1])(
    'rejects a strict stock panel containing price %s',
    async (price) => {
      mocks.getQuotes.mockResolvedValueOnce(STOCKS.map((symbol, index) => ({
        ...quote(symbol),
        price: index === 0 ? price : 100,
      })))

      await expect(getStocksDataWithStatus()).resolves.toHaveProperty('error')
    },
  )

  it('preserves legacy stock tolerance for a negative provider price', async () => {
    mocks.getQuotes.mockResolvedValueOnce(STOCKS.map((symbol, index) => ({
      ...quote(symbol),
      price: index === 0 ? -1 : 100,
    })))

    await expect(getStocksData()).resolves.toMatchObject({
      stocks: expect.arrayContaining([
        expect.objectContaining({ symbol: STOCKS[0], price: -1 }),
      ]),
    })
  })

  it('requires all five index quotes but preserves shaped HTTP-200 empty histories', async () => {
    const controller = new AbortController()
    mocks.getQuotes.mockResolvedValueOnce(INDICES.map(quote))

    const result = await getSparklineIndicesDataWithStatus(controller.signal)

    expect(result).toHaveProperty('indices')
    expect('indices' in result ? result.indices : []).toHaveLength(INDICES.length)
    expect(mocks.getQuotes).toHaveBeenCalledWith(INDICES, {
      failureMode: 'throw',
      signal: controller.signal,
    })
    expect(mocks.getIntraday).toHaveBeenCalledTimes(INDICES.length)
    expect(mocks.getIntraday).toHaveBeenCalledWith(
      '^GSPC',
      1,
      'minute',
      undefined,
      undefined,
      { failureMode: 'throw', signal: controller.signal },
    )
  })

  it('reports partial index quote coverage and strict candle failures', async () => {
    mocks.getQuotes
      .mockResolvedValueOnce(INDICES.slice(0, -1).map(quote))
      .mockResolvedValueOnce(INDICES.map(quote))

    await expect(getSparklineIndicesDataWithStatus()).resolves.toHaveProperty(
      'error',
    )
    expect(mocks.getIntraday).not.toHaveBeenCalled()

    mocks.getIntraday.mockRejectedValueOnce(new Error('503'))
    await expect(getSparklineIndicesDataWithStatus()).resolves.toHaveProperty(
      'error',
    )
  })

  it.each([0, -1])(
    'rejects a strict index panel containing price %s before loading candles',
    async (price) => {
      mocks.getQuotes.mockResolvedValueOnce(INDICES.map((symbol, index) => ({
        ...quote(symbol),
        price: index === 0 ? price : 100,
      })))

      await expect(getSparklineIndicesDataWithStatus()).resolves.toHaveProperty(
        'error',
      )
      expect(mocks.getIntraday).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['non-finite open', { open: Number.NaN }],
    ['non-finite high', { high: Number.POSITIVE_INFINITY }],
    ['zero low', { low: 0 }],
    ['negative close', { close: -1 }],
    ['high below open or close', { high: 100 }],
    ['low above open or close', { low: 100.5 }],
    ['high below low', { high: 98, low: 99 }],
  ])('rejects strict index history with %s', async (_label, overrides) => {
    mocks.getQuotes.mockResolvedValueOnce(INDICES.map(quote))
    mocks.getIntraday.mockImplementation(async () => [candle(overrides)])

    await expect(getSparklineIndicesDataWithStatus()).resolves.toHaveProperty(
      'error',
    )
  })

  it('preserves legacy index tolerance for an incoherent candle', async () => {
    mocks.getQuotes.mockResolvedValueOnce(INDICES.map(quote))
    mocks.getIntraday.mockImplementation(async () => [candle({ high: 100 })])

    const result = await getSparklineIndicesData()

    expect(result).toHaveProperty('indices')
    expect('indices' in result ? result.indices : []).toHaveLength(INDICES.length)
  })
})
