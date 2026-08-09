import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FOREX_BOND_PANEL } from '@/lib/forex-bonds-panel'
import {
  SLOW_MARKET_DATA_SECTIONS,
  type SlowMarketDataSection,
  type SlowSectionCaptureTimes,
} from '@/lib/slow-snapshot-types'

const mocks = vi.hoisted(() => ({
  getSlowSnapshotBase: vi.fn(),
  recoverSlowSnapshotForexBonds: vi.fn(),
}))

vi.mock('@/lib/slow-snapshot-base-cache', () => ({
  getSlowSnapshotBase: mocks.getSlowSnapshotBase,
}))

vi.mock('@/lib/slow-snapshot-forex-recovery', () => ({
  recoverSlowSnapshotForexBonds: mocks.recoverSlowSnapshotForexBonds,
}))

function forexPanel(price = 100) {
  return FOREX_BOND_PANEL.map(({ symbol, name }, index) => ({
    symbol,
    name,
    price: price + index,
    change: 1,
    changesPercentage: 1,
  }))
}

function baseResult(
  data: Record<string, unknown>,
  failedSections: string[] = [],
  options: {
    capturedAt?: string
    sectionCapturedAt?: SlowSectionCaptureTimes
    staleSections?: SlowMarketDataSection[]
  } = {},
) {
  const capturedAt = options.capturedAt ?? '2026-08-08T14:00:00.000Z'
  const sectionCapturedAt = Object.fromEntries(
    SLOW_MARKET_DATA_SECTIONS
      .filter((section) => Object.prototype.hasOwnProperty.call(data, section))
      .map((section) => [section, capturedAt]),
  ) as SlowSectionCaptureTimes

  return {
    data,
    failedSections,
    capturedAt,
    sectionCapturedAt: {
      ...sectionCapturedAt,
      ...options.sectionCapturedAt,
    },
    staleSections: options.staleSections ?? [],
    timedOut: false,
    usedStale: Boolean(options.staleSections?.length),
  }
}

function recoveryResult(
  forexBonds: ReturnType<typeof forexPanel>,
  capturedAt = '2026-08-08T14:01:00.000Z',
) {
  return { forexBonds, capturedAt }
}

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/market-snapshot/slow', { signal })
}

async function loadRoute() {
  return import('@/app/api/market-snapshot/slow/route')
}

describe('slow market snapshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.useRealTimers()
    mocks.recoverSlowSnapshotForexBonds.mockResolvedValue(null)
  })

  it('merges only a complete recovered forex panel into the healthy baseline', async () => {
    const baseline = {
      forexBonds: [],
      sectors: [{ sector: 'Technology', changesPercentage: '1.2' }],
      marketNews: [{ title: 'Healthy baseline headline' }],
    }
    const recoveredForex = forexPanel()
    mocks.getSlowSnapshotBase.mockResolvedValue(
      baseResult(baseline, ['forexBonds']),
    )
    mocks.recoverSlowSnapshotForexBonds.mockResolvedValue(
      recoveryResult(recoveredForex),
    )
    const { GET } = await loadRoute()

    const response = await GET(request())

    await expect(response.json()).resolves.toEqual({
      ...baseline,
      forexBonds: recoveredForex,
    })
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=120, stale-while-revalidate=600',
    )
    expect(response.headers.get('x-snapshot-degraded')).toBeNull()
    expect(response.headers.get('x-snapshot-captured-at')).toBe(
      '2026-08-08T14:00:00.000Z',
    )
    expect(mocks.getSlowSnapshotBase).toHaveBeenCalledTimes(1)
    expect(mocks.recoverSlowSnapshotForexBonds).toHaveBeenCalledTimes(1)
  })

  it('returns healthy baseline fields with no-store when recovery is unavailable', async () => {
    const baseline = {
      forexBonds: [],
      sectors: [{ sector: 'Energy', changesPercentage: '-0.4' }],
      marketNews: [{ title: 'Keep this headline' }],
    }
    mocks.getSlowSnapshotBase.mockResolvedValue(
      baseResult(baseline, ['forexBonds']),
    )
    const { GET } = await loadRoute()

    const first = await GET(request())
    const firstBody = await first.json()
    expect(firstBody).not.toHaveProperty('forexBonds')
    expect(firstBody).toMatchObject({
      sectors: baseline.sectors,
      marketNews: baseline.marketNews,
    })
    expect(first.headers.get('cache-control')).toBe('no-store')
    expect(first.headers.get('x-snapshot-degraded')).toBe('forex-bonds')

    const second = await GET(request())
    const secondBody = await second.json()
    expect(secondBody).not.toHaveProperty('forexBonds')
    expect(secondBody).toMatchObject({
      sectors: baseline.sectors,
      marketNews: baseline.marketNews,
    })
    expect(second.headers.get('x-cache')).toBe('MISS')
    expect(mocks.getSlowSnapshotBase).toHaveBeenCalledTimes(2)
    expect(mocks.recoverSlowSnapshotForexBonds).toHaveBeenCalledTimes(2)
  })

  it('does not invoke recovery when the base snapshot has all six forex rows', async () => {
    const complete = { forexBonds: forexPanel(), sectors: [] }
    mocks.getSlowSnapshotBase.mockResolvedValue(baseResult(complete))
    const { GET } = await loadRoute()

    const response = await GET(request())

    await expect(response.json()).resolves.toEqual(complete)
    expect(mocks.getSlowSnapshotBase).toHaveBeenCalledTimes(1)
    expect(mocks.recoverSlowSnapshotForexBonds).not.toHaveBeenCalled()
  })

  it('rejects a partial forex panel as degraded even without a failure marker', async () => {
    const partial = { forexBonds: forexPanel().slice(0, 1), sectors: [] }
    mocks.getSlowSnapshotBase.mockResolvedValue(baseResult(partial))
    const { GET } = await loadRoute()

    const response = await GET(request())

    const body = await response.json()
    expect(body).not.toHaveProperty('forexBonds')
    expect(body).toHaveProperty('sectors', [])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-snapshot-degraded')).toBe('forex-bonds')
    expect(mocks.recoverSlowSnapshotForexBonds).toHaveBeenCalledTimes(1)
  })

  it('uses the prior complete forex panel when a warm refresh returns a partial panel', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const priorPanel = forexPanel(100)
    mocks.getSlowSnapshotBase
      .mockResolvedValueOnce(
        baseResult(
          { forexBonds: priorPanel, sectors: [] },
          [],
          { capturedAt: '2026-08-08T14:00:00.000Z' },
        ),
      )
      .mockResolvedValueOnce(
        baseResult(
          {
            forexBonds: forexPanel(200).slice(0, 1),
            sectors: [],
          },
          [],
          { capturedAt: '2026-08-08T14:05:00.000Z' },
        ),
      )
    const { GET } = await loadRoute()

    await GET(request())
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    const response = await GET(request())

    await expect(response.json()).resolves.toMatchObject({
      forexBonds: priorPanel,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-snapshot-degraded')).toBe('forex-bonds')
    expect(response.headers.get('x-snapshot-captured-at')).toBe(
      '2026-08-08T14:00:00.000Z',
    )
  })

  it('omits a cold failed field so clients preserve it while returning successful empties', async () => {
    const panel = forexPanel()
    mocks.getSlowSnapshotBase.mockResolvedValue(baseResult({
      forexBonds: panel,
      marketNews: [],
    }, ['sectors']))
    const { GET } = await loadRoute()

    const response = await GET(request())
    const body = await response.json()

    expect(body).not.toHaveProperty('sectors')
    expect(body).toHaveProperty('marketNews', [])
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-snapshot-degraded')).toBe('sectors')
  })

  it('starts the route TTL at recovery completion while preserving source capture time on HIT', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-08T14:00:00.000Z')
    vi.setSystemTime(startedAt)
    const baseline = { forexBonds: [], sectors: [] }
    const recoveredForex = forexPanel()
    mocks.getSlowSnapshotBase.mockResolvedValue(
      baseResult(baseline, ['forexBonds'], {
        capturedAt: '2026-08-08T14:00:00.000Z',
      }),
    )
    mocks.recoverSlowSnapshotForexBonds.mockImplementationOnce(async () => {
      vi.setSystemTime(startedAt.getTime() + 60_000)
      return recoveryResult(
        recoveredForex,
        '2026-08-08T14:01:00.000Z',
      )
    })
    const { GET } = await loadRoute()

    const miss = await GET(request())
    const capturedAt = miss.headers.get('x-snapshot-captured-at')
    expect(miss.headers.get('x-cache')).toBe('MISS')
    expect(capturedAt).toBe('2026-08-08T14:00:00.000Z')

    vi.setSystemTime(startedAt.getTime() + 359_999)
    const hit = await GET(request())
    expect(hit.headers.get('x-cache')).toBe('HIT')
    expect(hit.headers.get('x-snapshot-captured-at')).toBe(capturedAt)

    vi.setSystemTime(startedAt.getTime() + 360_000)
    mocks.getSlowSnapshotBase.mockResolvedValue(
      baseResult(
        { ...baseline, forexBonds: recoveredForex },
        [],
        { capturedAt: '2026-08-08T14:06:00.000Z' },
      ),
    )
    expect((await GET(request())).headers.get('x-cache')).toBe('MISS')
    expect(mocks.getSlowSnapshotBase).toHaveBeenCalledTimes(2)
  })

  it('preserves only explicitly failed fields after expiry and never promotes the degraded refresh', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-08T14:00:00.000Z')
    const panel = forexPanel()
    const prior = {
      forexBonds: panel,
      sectors: [{ sector: 'Technology', changesPercentage: '1.5' }],
      marketNews: [{ title: 'Old headline' }],
    }
    const degraded = {
      forexBonds: panel,
      sectors: [],
      marketNews: [],
    }
    const recovered = {
      forexBonds: panel,
      sectors: [{ sector: 'Energy', changesPercentage: '2.0' }],
      marketNews: [],
    }
    mocks.getSlowSnapshotBase
      .mockResolvedValueOnce(
        baseResult(prior, [], {
          capturedAt: '2026-08-08T14:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        baseResult(degraded, ['sectors'], {
          capturedAt: '2026-08-08T14:05:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        baseResult(recovered, [], {
          capturedAt: '2026-08-08T14:05:01.000Z',
        }),
      )
    const { GET } = await loadRoute()

    expect((await GET(request())).headers.get('cache-control')).toContain('public')
    await vi.advanceTimersByTimeAsync(5 * 60_000)

    const degradedResponse = await GET(request())
    await expect(degradedResponse.json()).resolves.toEqual({
      ...degraded,
      sectors: prior.sectors,
    })
    expect(degradedResponse.headers.get('cache-control')).toBe('no-store')
    expect(degradedResponse.headers.get('x-snapshot-degraded')).toBe('sectors')
    expect(degradedResponse.headers.get('x-snapshot-captured-at')).toBe(
      '2026-08-08T14:00:00.000Z',
    )

    const retry = await GET(request())
    await expect(retry.json()).resolves.toEqual(recovered)
    expect(retry.headers.get('cache-control')).toContain('public')
    expect(retry.headers.get('x-cache')).toBe('MISS')
    expect(mocks.getSlowSnapshotBase).toHaveBeenCalledTimes(3)
  })

  it('drops overwritten stale provenance from a mixed FX recovery', async () => {
    const staleForexCapturedAt = '2026-08-08T13:50:00.000Z'
    const healthyBaseCapturedAt = '2026-08-08T14:00:00.000Z'
    const recoveryCapturedAt = '2026-08-08T14:01:00.000Z'
    const staleForex = forexPanel(90)
    const recoveredForex = forexPanel(120)
    mocks.getSlowSnapshotBase.mockResolvedValue(
      baseResult(
        {
          forexBonds: staleForex,
          sectors: [{ sector: 'Energy', changesPercentage: '1.0' }],
        },
        ['forexBonds'],
        {
          capturedAt: staleForexCapturedAt,
          staleSections: ['forexBonds'],
          sectionCapturedAt: {
            forexBonds: staleForexCapturedAt,
            sectors: healthyBaseCapturedAt,
          },
        },
      ),
    )
    mocks.recoverSlowSnapshotForexBonds.mockResolvedValue(
      recoveryResult(recoveredForex, recoveryCapturedAt),
    )
    const { GET } = await loadRoute()

    const response = await GET(request())

    await expect(response.json()).resolves.toMatchObject({
      forexBonds: recoveredForex,
      sectors: [{ sector: 'Energy', changesPercentage: '1.0' }],
    })
    expect(response.headers.get('x-snapshot-degraded')).toBeNull()
    expect(response.headers.get('x-snapshot-captured-at')).toBe(
      healthyBaseCapturedAt,
    )
  })
})
