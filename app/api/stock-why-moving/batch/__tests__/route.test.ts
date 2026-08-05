import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cached: vi.fn(),
  live: vi.fn(),
  isFresh: vi.fn(),
  getNews: vi.fn(),
}))

vi.mock('@/lib/stock-why-moving-display', () => ({
  getCachedStockWhyMovingDisplayData: mocks.cached,
  getStockWhyMovingDisplayData: mocks.live,
}))
vi.mock('@/lib/stock-why-moving', () => ({
  isFreshWhyMovingResult: mocks.isFresh,
}))
vi.mock('@/lib/providers', () => ({
  getProvider: () => ({ getNews: mocks.getNews }),
}))

import { POST } from '@/app/api/stock-why-moving/batch/route'

function request(symbols: string[]) {
  return new Request('http://localhost/api/stock-why-moving/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols }),
  })
}

describe('stock why-moving batch route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cached.mockResolvedValue(null)
    mocks.live.mockResolvedValue({
      symbol: 'AAPL',
      status: 'not_found',
      displayText: null,
      summary: null,
      sourceTimestamp: null,
      sourceUrl: null,
      fetchedAt: new Date().toISOString(),
    })
    mocks.isFresh.mockReturnValue(false)
    mocks.getNews.mockResolvedValue([])
  })

  it('caps the public fan-out to the single symbol used by the UI', async () => {
    const response = await POST(request(['AAPL', 'MSFT', 'NVDA']) as never)
    const payload = await response.json()

    expect(Object.keys(payload.reasons)).toEqual(['AAPL'])
    expect(mocks.live).toHaveBeenCalledTimes(1)
  })

  it('honors a fresh negative cache without scraping or fetching news again', async () => {
    mocks.cached.mockResolvedValue({
      symbol: 'AAPL',
      status: 'not_found',
      displayText: null,
      summary: null,
      sourceTimestamp: null,
      sourceUrl: null,
      fetchedAt: new Date().toISOString(),
    })
    mocks.isFresh.mockReturnValue(true)

    const response = await POST(request(['AAPL']) as never)
    const payload = await response.json()

    expect(payload.reasons.AAPL.status).toBe('not_found')
    expect(mocks.live).not.toHaveBeenCalled()
    expect(mocks.getNews).not.toHaveBeenCalled()
  })

  it('uses the normal cached loader instead of a public force refresh', async () => {
    await POST(request(['AAPL']) as never)

    expect(mocks.live).toHaveBeenCalledWith('AAPL', {
      preferGenerated: false,
    })
  })
})
