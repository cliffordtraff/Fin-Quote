import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchMarketData: vi.fn(),
  getSummary: vi.fn(),
  getTrends: vi.fn(),
  getCalendar: vi.fn(),
  createServiceRoleClient: vi.fn(),
  cacheRows: {} as Record<
    string,
    Array<{ data: Record<string, unknown> | null; error: { message: string } | null }>
  >,
}))

vi.mock('@/lib/fetch-market-data', () => ({
  fetchAllMarketData: mocks.fetchMarketData,
}))
vi.mock('@/app/actions/market-summary', () => ({
  getMarketSummary: mocks.getSummary,
}))
vi.mock('@/app/actions/market-trends-responses', () => ({
  getMarketTrendsResponses: mocks.getTrends,
}))
vi.mock('@/app/actions/calendar-summaries', () => ({
  getCalendarSummaries: mocks.getCalendar,
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { refreshDashboardCommentary } from '@/lib/refresh-dashboard-commentary'

const marketDate = '2026-08-03'
const today = '2026-08-03T14:14:00.000Z'
const yesterday = '2026-08-02T14:14:00.000Z'
const sixBullets = Array.from({ length: 6 }, (_, index) => ({
  emoji: '•',
  title: `Trend ${index + 1}`,
  description: 'Market context',
}))

function cacheResult(data: Record<string, unknown> | null) {
  return { data, error: null }
}

function installCacheRows(
  rows: typeof mocks.cacheRows,
) {
  mocks.cacheRows = rows
  mocks.createServiceRoleClient.mockReturnValue({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              const next = mocks.cacheRows[table]?.shift()
              return next ?? { data: null, error: null }
            }),
          })),
        })),
      })),
    })),
  })
}

describe('refreshDashboardCommentary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchMarketData.mockResolvedValue({
      gainers: {
        cash: [
          {
            symbol: 'UP',
            name: 'Up',
            price: 2,
            change: 1,
            changesPercentage: 100,
          },
        ],
      },
      losers: {
        cash: [
          {
            symbol: 'DN',
            name: 'Down',
            price: 1,
            change: -1,
            changesPercentage: -50,
          },
        ],
      },
      sectors: [],
      sparklineIndices: [],
      forexBonds: [],
      vix: null,
      marketNews: [],
      economicEvents: [],
      earnings: [],
    })
    mocks.getSummary.mockResolvedValue({ summary: 'Fresh summary' })
    mocks.getTrends.mockResolvedValue({
      bullets: sixBullets,
      approach: 'responses-api',
      generatedAt: today,
    })
    mocks.getCalendar.mockResolvedValue({
      economicSummary: 'Fresh economic summary.',
      earningsSummary: 'Fresh earnings summary.',
    })
  })

  it('fully skips generation when every component is ready for the New York market date', async () => {
    installCacheRows({
      market_summary_cache: [
        // 03:59 UTC on Aug 4 is still Aug 3 in America/New_York.
        cacheResult({ summary: 'Ready', created_at: '2026-08-04T03:59:00.000Z' }),
      ],
      market_trends_cache: [
        cacheResult({ bullets: sixBullets, created_at: today }),
      ],
      calendar_summaries_cache: [
        cacheResult({
          economic_summary: 'Economic context.',
          earnings_summary: 'Earnings context.',
          created_at: today,
        }),
      ],
    })

    const result = await refreshDashboardCommentary({ marketDate })

    expect(result).toMatchObject({
      marketDate,
      attempted: [],
      skippedComponents: ['marketSummary', 'marketTrends', 'calendar'],
      complete: true,
      marketSummary: { ready: true, refreshed: false },
      marketTrends: { ready: true, bulletCount: 6, refreshed: false },
      calendar: { ready: true, refreshed: false },
    })
    expect(mocks.fetchMarketData).not.toHaveBeenCalled()
    expect(mocks.getSummary).not.toHaveBeenCalled()
    expect(mocks.getTrends).not.toHaveBeenCalled()
    expect(mocks.getCalendar).not.toHaveBeenCalled()
  })

  it('retries only missing components and verifies that their cache rows persisted', async () => {
    installCacheRows({
      market_summary_cache: [
        cacheResult({ summary: 'Already ready', created_at: today }),
        cacheResult({ summary: 'Already ready', created_at: today }),
      ],
      market_trends_cache: [
        cacheResult({ bullets: sixBullets, created_at: yesterday }),
        cacheResult({ bullets: sixBullets, created_at: today }),
      ],
      calendar_summaries_cache: [
        cacheResult({
          economic_summary: 'Incomplete economic context.',
          earnings_summary: '',
          created_at: today,
        }),
        cacheResult({
          economic_summary: 'Fresh economic context.',
          earnings_summary: 'Fresh earnings context.',
          created_at: today,
        }),
      ],
    })

    const result = await refreshDashboardCommentary({ marketDate })

    expect(result).toMatchObject({
      attempted: ['marketTrends', 'calendar'],
      skippedComponents: ['marketSummary'],
      complete: true,
      marketSummary: { ready: true, refreshed: false },
      marketTrends: { ready: true, refreshed: true },
      calendar: { ready: true, refreshed: true },
    })
    expect(mocks.fetchMarketData).toHaveBeenCalledOnce()
    expect(mocks.getSummary).not.toHaveBeenCalled()
    expect(mocks.getTrends).toHaveBeenCalledWith(
      expect.objectContaining({ losers: expect.any(Array) }),
      true,
    )
    expect(mocks.getCalendar).toHaveBeenCalledWith([], [], true)
  })

  it('keeps a generated component retryable when no complete cache row was persisted', async () => {
    installCacheRows({
      market_summary_cache: [
        cacheResult(null),
        cacheResult(null),
      ],
      market_trends_cache: [
        cacheResult({ bullets: sixBullets, created_at: today }),
        cacheResult({ bullets: sixBullets, created_at: today }),
      ],
      calendar_summaries_cache: [
        cacheResult({
          economic_summary: 'Economic context.',
          earnings_summary: 'Earnings context.',
          created_at: today,
        }),
        cacheResult({
          economic_summary: 'Economic context.',
          earnings_summary: 'Earnings context.',
          created_at: today,
        }),
      ],
    })

    const result = await refreshDashboardCommentary({ marketDate })

    expect(result).toMatchObject({
      attempted: ['marketSummary'],
      complete: false,
      marketSummary: {
        ready: false,
        refreshed: false,
        error: 'No complete market-summary cache row was persisted',
      },
    })
  })
})
