import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchLiveMoversMarketData: vi.fn(),
}))

vi.mock('@/lib/fetch-market-data', () => ({
  fetchLiveMoversMarketData: mocks.fetchLiveMoversMarketData,
}))

const mover = {
  symbol: 'AAPL',
  name: 'Apple',
  price: 215,
  change: 5,
  changesPercentage: 2.38,
}

const liveMovers = {
  gainers: {
    premarket: [mover],
    cash: [mover],
    afterhours: [mover],
    currentSession: 'cash',
  },
  losers: {
    premarket: [],
    cash: [],
    afterhours: [],
    currentSession: 'cash',
  },
}

describe('live movers market snapshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.fetchLiveMoversMarketData.mockResolvedValue(liveMovers)
  })

  it('returns only the live mover contract and caches repeated route calls', async () => {
    const { GET } = await import('@/app/api/market-snapshot/live-movers/route')

    const firstResponse = await GET()
    const responseText = await firstResponse.text()
    const payload = JSON.parse(responseText)

    expect(firstResponse.headers.get('X-Cache')).toBe('MISS')
    expect(firstResponse.headers.get('X-Snapshot')).toBe('live-movers')
    expect(Object.keys(payload)).toEqual(['gainers', 'losers'])
    expect(mocks.fetchLiveMoversMarketData).toHaveBeenCalledTimes(1)

    const secondResponse = await GET()
    expect(secondResponse.headers.get('X-Cache')).toBe('HIT')
    expect(mocks.fetchLiveMoversMarketData).toHaveBeenCalledTimes(1)

    const representativeLegacyFastPayload = {
      ...liveMovers,
      spx: { price: 6500, changesPercentage: 0.5 },
      nasdaq: { price: 22000, changesPercentage: 0.7 },
      dow: { price: 46000, changesPercentage: 0.3 },
      russell: { price: 2450, changesPercentage: 0.2 },
      stocks: Array.from({ length: 10 }, (_, index) => ({ ...mover, symbol: `STK${index}` })),
      vix: { price: 17.5, changesPercentage: -2 },
      mostActive: Array.from({ length: 10 }, (_, index) => ({ ...mover, symbol: `ACT${index}` })),
      trending: Array.from({ length: 10 }, (_, index) => ({ ...mover, symbol: `TRD${index}` })),
      sp500Gainers: Array.from({ length: 10 }, (_, index) => ({ ...mover, symbol: `G${index}` })),
      sp500Losers: Array.from({ length: 10 }, (_, index) => ({ ...mover, symbol: `L${index}` })),
      sparklineIndices: Array.from({ length: 10 }, (_, index) => ({ symbol: `IDX${index}`, data: [1, 2, 3, 4, 5] })),
    }
    const liveResponseBytes = new TextEncoder().encode(responseText).byteLength
    const representativeLegacyBytes = new TextEncoder()
      .encode(JSON.stringify(representativeLegacyFastPayload)).byteLength
    const responseByteReduction = 1 - liveResponseBytes / representativeLegacyBytes

    expect(Object.keys(representativeLegacyFastPayload)).toHaveLength(13)
    expect({ liveResponseBytes, representativeLegacyBytes }).toEqual({
      liveResponseBytes: 394,
      representativeLegacyBytes: 5_100,
    })
    expect(responseByteReduction).toBeCloseTo(0.923, 3)
  })
})
