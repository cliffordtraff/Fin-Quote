import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getGeneratedStockWhyMovingDataMock,
  getStockWhyMovingDataMock,
  peekStockWhyMovingCacheMock,
} = vi.hoisted(() => ({
  getGeneratedStockWhyMovingDataMock: vi.fn(),
  getStockWhyMovingDataMock: vi.fn(),
  peekStockWhyMovingCacheMock: vi.fn(),
}))

vi.mock('@/lib/generated-stock-why-moving', () => ({
  getGeneratedStockWhyMovingData: getGeneratedStockWhyMovingDataMock,
}))

vi.mock('@/lib/stock-why-moving', () => ({
  getStockWhyMovingData: getStockWhyMovingDataMock,
  peekStockWhyMovingCache: peekStockWhyMovingCacheMock,
}))

import {
  getCachedStockWhyMovingDisplayData,
  getStockWhyMovingDisplayData,
} from '@/lib/stock-why-moving-display'

const cachedResult = {
  symbol: 'AAPL',
  status: 'found' as const,
  displayText: 'Cached catalyst',
  headline: 'Cached catalyst',
  summary: null,
  bulletPoints: [],
  sentiment: null,
  source: 'cache',
  sourceTimestamp: null,
  isCatalyst: true,
  sourceUrl: '',
  fetchedAt: '2026-07-27T12:00:00.000Z',
  errorMessage: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('stock why-moving display loaders', () => {
  it('uses generated data without reading or refreshing the fallback cache', async () => {
    getGeneratedStockWhyMovingDataMock.mockResolvedValue(cachedResult)

    await expect(getCachedStockWhyMovingDisplayData('AAPL')).resolves.toEqual(cachedResult)

    expect(peekStockWhyMovingCacheMock).not.toHaveBeenCalled()
    expect(getStockWhyMovingDataMock).not.toHaveBeenCalled()
  })

  it('lets cacheable stock pages use persisted data without a live scrape', async () => {
    getGeneratedStockWhyMovingDataMock.mockResolvedValue(null)
    peekStockWhyMovingCacheMock.mockResolvedValue({
      freshness: 'fresh',
      result: cachedResult,
    })

    await expect(getCachedStockWhyMovingDisplayData('AAPL')).resolves.toEqual(cachedResult)

    expect(peekStockWhyMovingCacheMock).toHaveBeenCalledWith('AAPL')
    expect(getStockWhyMovingDataMock).not.toHaveBeenCalled()
  })

  it('preserves live fallback behavior for the explicit refresh loader', async () => {
    const liveResult = { ...cachedResult, displayText: 'Live catalyst' }
    getGeneratedStockWhyMovingDataMock.mockResolvedValue(null)
    getStockWhyMovingDataMock.mockResolvedValue(liveResult)

    await expect(getStockWhyMovingDisplayData('AAPL')).resolves.toEqual(liveResult)

    expect(getStockWhyMovingDataMock).toHaveBeenCalledWith('AAPL', {
      forceRefresh: undefined,
    })
  })
})
