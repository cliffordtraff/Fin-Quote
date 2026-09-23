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

  it('shows nothing rather than Finviz text when we have no summary', async () => {
    getGeneratedStockWhyMovingDataMock.mockResolvedValue(null)
    peekStockWhyMovingCacheMock.mockResolvedValue({ freshness: 'fresh', result: cachedResult })

    await expect(getCachedStockWhyMovingDisplayData('AAPL')).resolves.toBeNull()
    const live = await getStockWhyMovingDisplayData('AAPL')
    expect(live).toMatchObject({ symbol: 'AAPL', status: 'not_found', displayText: null, source: null })

    expect(peekStockWhyMovingCacheMock).not.toHaveBeenCalled()
    expect(getStockWhyMovingDataMock).not.toHaveBeenCalled()
  })

  it('returns our generated summary from the live loader', async () => {
    getGeneratedStockWhyMovingDataMock.mockResolvedValue(cachedResult)

    await expect(getStockWhyMovingDisplayData('AAPL')).resolves.toEqual(cachedResult)
    expect(getStockWhyMovingDataMock).not.toHaveBeenCalled()
  })
})
