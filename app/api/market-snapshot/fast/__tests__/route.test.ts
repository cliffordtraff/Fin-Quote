import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getFastSnapshotBase: vi.fn(),
}))

vi.mock('@/lib/fast-snapshot-base-cache', () => ({
  getFastSnapshotBase: mocks.getFastSnapshotBase,
}))

import { GET } from '@/app/api/market-snapshot/fast/route'

const CAPTURED_AT = '2026-08-09T14:30:00.000Z'

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/market-snapshot/fast', { signal })
}

function result(
  overrides: Partial<{
    cacheStatus: 'HIT' | 'MISS'
    capturedAt: string
    data: Record<string, unknown>
    failedSections: Array<'gainers' | 'losers' | 'stocks' | 'sparklineIndices'>
    timedOut: boolean
  }> = {},
) {
  return {
    cacheStatus: 'MISS' as const,
    capturedAt: CAPTURED_AT,
    data: {
      gainers: {},
      losers: {},
      stocks: [],
      sparklineIndices: [],
    },
    failedSections: [],
    timedOut: false,
    ...overrides,
  }
}

describe('fast market snapshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes only complete snapshots with original capture provenance', async () => {
    mocks.getFastSnapshotBase.mockResolvedValue(result())
    const controller = new AbortController()
    const incomingRequest = request(controller.signal)

    const response = await GET(incomingRequest)

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=10, stale-while-revalidate=30',
    )
    expect(response.headers.get('x-cache')).toBe('MISS')
    expect(response.headers.get('x-snapshot')).toBe('fast')
    expect(response.headers.get('x-snapshot-captured-at')).toBe(CAPTURED_AT)
    expect(response.headers.get('x-snapshot-degraded')).toBeNull()
    expect(mocks.getFastSnapshotBase).toHaveBeenCalledWith(
      incomingRequest.signal,
    )
  })

  it('marks degraded patches no-store and keeps failed fields absent', async () => {
    mocks.getFastSnapshotBase.mockResolvedValue(result({
      data: { gainers: {}, stocks: [] },
      failedSections: ['losers', 'sparklineIndices'],
    }))

    const response = await GET(request())

    await expect(response.json()).resolves.toEqual({ gainers: {}, stocks: [] })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-snapshot-degraded')).toBe(
      'losers,sparkline-indices',
    )
  })

  it('preserves a cache HIT capture time instead of relabeling it at receipt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2030-01-01T00:00:00.000Z')
    mocks.getFastSnapshotBase.mockResolvedValue(result({ cacheStatus: 'HIT' }))

    const response = await GET(request())

    expect(response.headers.get('x-cache')).toBe('HIT')
    expect(response.headers.get('x-snapshot-captured-at')).toBe(CAPTURED_AT)
  })
})
