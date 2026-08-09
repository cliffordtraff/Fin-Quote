import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AllMarketData } from '@/lib/market-types'

const mocks = vi.hoisted(() => ({
  useDashboardMarketSnapshots: vi.fn(),
  catalystTimeline: vi.fn((props: unknown) => {
    void props
    return null
  }),
  setPreference: vi.fn(),
}))

vi.mock('@/lib/hooks/use-dashboard-market-snapshots', () => ({
  useDashboardMarketSnapshots: mocks.useDashboardMarketSnapshots,
}))

vi.mock('@/lib/timezone-context', () => ({
  useTimezone: () => ({ timezone: 'UTC' }),
  getTimezoneAbbr: () => 'UTC',
}))

vi.mock('@/lib/timezone-utils', () => ({
  formatTimeInTimezone: (date: Date) => date.toISOString().slice(11, 16),
}))

vi.mock('@/components/useDashboardPreferences', () => ({
  useDashboardPreferences: () => ({
    preferences: {
      moverSession: 'cash',
      watchlistSymbols: ['AAPL'],
      crossAssetExpanded: false,
      flowsExpanded: false,
      sp500MoversExpanded: false,
    },
    setPreference: mocks.setPreference,
  }),
}))

vi.mock('@/components/CatalystTimeline', () => ({
  default: (props: unknown) => mocks.catalystTimeline(props),
}))
vi.mock('@/components/ForexBondsTable', () => ({ default: () => null }))
vi.mock('@/components/FuturesTable', () => ({ default: () => null }))
vi.mock('@/components/IndexSparklines', () => ({ default: () => null }))
vi.mock('@/components/MarketInsights', () => ({ default: () => null }))
vi.mock('@/components/MarketSessions', () => ({ default: () => null }))
vi.mock('@/components/MarketTrendsCombined', () => ({ default: () => null }))
vi.mock('@/components/SectorHeatmap', () => ({ default: () => null }))
vi.mock('@/components/StocksTable', () => ({ default: () => null }))
vi.mock('@/components/TopGainerSparklines', () => ({ default: () => null }))
vi.mock('@/components/TopInsiderTrades', () => ({ default: () => null }))

import MarketDashboardSunday from '@/components/MarketDashboardSunday'

function data(): AllMarketData {
  const movers = {
    premarket: [],
    cash: [],
    afterhours: [],
    currentSession: 'cash' as const,
  }
  return {
    spx: null,
    nasdaq: null,
    dow: null,
    russell: null,
    esFutures: null,
    futures: [],
    futuresWithHistory: [],
    gainers: movers,
    losers: movers,
    stocks: [],
    sectors: [],
    vix: null,
    economicEvents: [],
    marketNews: [{
      title: 'Headline',
      text: '',
      url: 'https://example.com',
      publishedDate: '2026-08-09T14:00:00.000Z',
      site: 'Example',
    }],
    sparklineIndices: [],
    mostActive: [],
    trending: [],
    sp500Gainers: [],
    sp500Losers: [],
    earnings: [],
    earningsTotalCount: 0,
    sp500GainerSparklines: [],
    sp500LoserSparklines: [],
    metaSparkline: null,
    xlbSparkline: null,
    forexBonds: [],
    largeInsiderTrades: [],
    globalIndexQuotes: [],
    globalFuturesQuotes: [],
    marketSummary: '',
    marketTrendsBullets: [],
  }
}

describe('MarketDashboardSunday freshness labels', () => {
  it('uses fast, slow, and initial-only global provenance independently', () => {
    const initialData = data()
    const initialCaptureTimes = {
      fastCapturedAt: '2026-08-09T12:15:00.000Z',
      slowCapturedAt: '2026-08-09T12:10:00.000Z',
      globalLoadedAt: '2026-08-09T12:05:00.000Z',
    }
    mocks.useDashboardMarketSnapshots.mockReturnValue({
      data: initialData,
      freshness: {
        fastCapturedAt: '2026-08-09T14:30:00.000Z',
        slowCapturedAt: '2026-08-09T13:30:00.000Z',
        globalLoadedAt: '2026-08-09T12:30:00.000Z',
        fastDegradedSections: ['stocks'],
        slowDegradedSections: [],
      },
      clockAt: '2026-08-09T15:00:00.000Z',
      refreshing: false,
      refreshError: null,
      refreshDashboard: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <MarketDashboardSunday
        initialData={initialData}
        initialCaptureTimes={initialCaptureTimes}
        chartOfDayPresentation={{} as never}
        initialRenderedAt="2026-08-09T12:30:00.000Z"
      />,
    )

    expect(
      screen.getByText(
        'Prices 14:30 UTC · partial · Slow data 13:30 UTC',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('0 markets · Quotes 14:30 UTC · partial'),
    ).toBeInTheDocument()
    expect(screen.getByText('Snapshot 13:30 UTC')).toBeInTheDocument()
    expect(
      screen.getByText('Filings 13:30 UTC · Global quotes loaded 12:30 UTC'),
    ).toBeInTheDocument()
    expect(mocks.catalystTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ referenceTime: '2026-08-09T15:00:00.000Z' }),
    )
    expect(mocks.useDashboardMarketSnapshots).toHaveBeenCalledWith(
      initialData,
      initialCaptureTimes,
      '2026-08-09T12:30:00.000Z',
    )
  })
})
