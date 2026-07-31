'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import EconomicCalendar from '@/components/EconomicCalendar'
import EarningsCalendar from '@/components/EarningsCalendar'
import ForexBondsTable from '@/components/ForexBondsTable'
import FuturesTable from '@/components/FuturesTable'
import IndexSparklines from '@/components/IndexSparklines'
import MarketHeadlines from '@/components/MarketHeadlines'
import MarketInsights from '@/components/MarketInsights'
import MarketSessions from '@/components/MarketSessions'
import MarketTrendsCombined from '@/components/MarketTrendsCombined'
import SectorHeatmap from '@/components/SectorHeatmap'
import StocksTable from '@/components/StocksTable'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import { getMarketSummary } from '@/app/actions/market-summary'
import {
  getMarketTrendsResponses,
  type MarketTrendsBullet,
} from '@/app/actions/market-trends-responses'
import type { AllMarketData } from '@/lib/market-types'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import { safeErrorMessage } from '@/lib/safe-logging'
import { getTimezoneAbbr, useTimezone } from '@/lib/timezone-context'
import { formatTimeInTimezone } from '@/lib/timezone-utils'

interface MarketDashboardSundayProps {
  initialData: AllMarketData
  chartOfDaySpec: NewsletterChartSpec
}

const SESSION_LABELS = {
  premarket: 'Pre-market',
  cash: 'Regular session',
  afterhours: 'After-hours',
  closed: 'Markets closed',
} as const

async function fetchMarketPatch(
  endpoint: '/api/market-snapshot/fast' | '/api/market-snapshot/slow',
): Promise<Partial<AllMarketData>> {
  const response = await fetch(endpoint, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Market snapshot returned ${response.status}`)
  }
  return response.json() as Promise<Partial<AllMarketData>>
}

function SectionHeading({
  title,
  meta,
}: {
  title: string
  meta?: ReactNode
}) {
  return (
    <div className="mb-3 flex min-h-8 flex-wrap items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-gray-950 dark:text-white">
        {title}
      </h2>
      {meta ? (
        <div className="text-xs text-gray-500 dark:text-gray-400">{meta}</div>
      ) : null}
    </div>
  )
}

function DataUnavailable({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex min-h-36 items-center justify-center rounded-lg border border-gray-200 bg-white px-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
    >
      {label} data is currently unavailable.
    </div>
  )
}

function extractSummary(summary: string) {
  if (!summary) {
    return { headline: '', body: '' }
  }

  const parts = summary.split(/\n\n/)
  if (parts.length > 1) {
    return {
      headline: parts[0].trim(),
      body: parts.slice(1).join('\n\n').trim(),
    }
  }

  const firstSentence = summary.match(/^[^.!?]+[.!?]/)?.[0]
  if (!firstSentence) {
    return { headline: '', body: summary }
  }

  return {
    headline: firstSentence.trim(),
    body: summary.slice(firstSentence.length).trim(),
  }
}

export default function MarketDashboardSunday({
  initialData,
  chartOfDaySpec,
}: MarketDashboardSundayProps) {
  const { timezone } = useTimezone()
  const [data, setData] = useState(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [marketSummary, setMarketSummary] = useState(
    initialData.marketSummary || '',
  )
  const [marketSummaryLoading, setMarketSummaryLoading] = useState(
    !initialData.marketSummary,
  )
  const [summaryLastUpdated, setSummaryLastUpdated] = useState<Date | null>(null)
  const [responsesApiBullets, setResponsesApiBullets] = useState<
    MarketTrendsBullet[]
  >(initialData.marketTrendsBullets || [])
  const [responsesLoading, setResponsesLoading] = useState(
    !initialData.marketTrendsBullets?.length,
  )
  const [responsesError, setResponsesError] = useState<string | undefined>()
  const [responsesGeneratedAt, setResponsesGeneratedAt] = useState<
    string | undefined
  >()

  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  async function fetchSummary(forceRefresh = false) {
    setMarketSummaryLoading(true)

    try {
      const result = await getMarketSummary(
        {
          gainers: data.gainers.cash,
          losers: data.losers.cash,
          sectors: data.sectors,
          indices: data.sparklineIndices,
          forexBonds: data.forexBonds,
          vix: data.vix,
          marketNews: data.marketNews,
        },
        forceRefresh,
      )

      if (result.summary) {
        setMarketSummary(result.summary)
        setSummaryLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Failed to fetch market summary:', safeErrorMessage(error))
    } finally {
      setMarketSummaryLoading(false)
    }
  }

  async function fetchResponsesBullets() {
    setResponsesLoading(true)
    setResponsesError(undefined)

    try {
      const result = await getMarketTrendsResponses({
        gainers: data.gainers.cash,
        losers: data.losers.cash,
        sectors: data.sectors,
        indices: data.sparklineIndices,
        forexBonds: data.forexBonds,
        vix: data.vix,
      })

      if (result.error) {
        setResponsesError(result.error)
      } else {
        setResponsesApiBullets(result.bullets)
        setResponsesGeneratedAt(result.generatedAt)
      }
    } catch (error) {
      const message = safeErrorMessage(error)
      console.error('Failed to fetch market trends:', message)
      setResponsesError('Market trends are currently unavailable.')
    } finally {
      setResponsesLoading(false)
    }
  }

  useEffect(() => {
    if (!initialData.marketSummary) {
      void fetchSummary()
    }
    if (!initialData.marketTrendsBullets?.length) {
      void fetchResponsesBullets()
    }
    // Initial cached values decide whether these one-time requests are needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let disposed = false

    const refreshFastData = async () => {
      if (document.visibilityState !== 'visible') return

      try {
        const patch = await fetchMarketPatch('/api/market-snapshot/fast')
        if (!disposed) {
          setData((current) => ({ ...current, ...patch }))
          setLastUpdated(new Date())
        }
      } catch (error) {
        console.error(
          'Failed to refresh market snapshot:',
          safeErrorMessage(error),
        )
      }
    }

    const interval = window.setInterval(() => {
      void refreshFastData()
    }, 60_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshFastData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  async function refreshDashboard() {
    setRefreshing(true)
    setRefreshError(null)

    const [fastResult, slowResult] = await Promise.allSettled([
      fetchMarketPatch('/api/market-snapshot/fast'),
      fetchMarketPatch('/api/market-snapshot/slow'),
    ])

    const patches = [fastResult, slowResult].flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )

    if (patches.length > 0) {
      setData((current) =>
        patches.reduce<AllMarketData>(
          (next, patch) => ({ ...next, ...patch }),
          current,
        ),
      )
      setLastUpdated(new Date())
    }

    if (patches.length < 2) {
      setRefreshError(
        patches.length === 0
          ? 'Market data could not be refreshed.'
          : 'Core prices refreshed; some slower sections remain on their previous snapshot.',
      )
    }

    setRefreshing(false)
  }

  const { headline: summaryHeadline, body: summaryBody } = useMemo(
    () => extractSummary(marketSummary),
    [marketSummary],
  )

  const {
    futures,
    gainers,
    losers,
    stocks,
    sectors,
    economicEvents,
    marketNews,
    sparklineIndices,
    earnings,
    earningsTotalCount,
    sp500GainerSparklines,
    sp500LoserSparklines,
    forexBonds,
    largeInsiderTrades,
    globalIndexQuotes,
    globalFuturesQuotes,
  } = data

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  }).format(lastUpdated ?? new Date())

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-b border-gray-200 pb-5 dark:border-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{dateLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    gainers.currentSession === 'closed'
                      ? 'bg-gray-400'
                      : 'bg-emerald-500'
                  }`}
                />
                {SESSION_LABELS[gainers.currentSession]}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">
              Market Overview
            </h1>
            <div className="mt-2 min-h-6 max-w-5xl">
              {marketSummaryLoading ? (
                <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              ) : summaryHeadline ? (
                <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {summaryHeadline}
                </p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Live market snapshot
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {lastUpdated ? (
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                Updated {formatTimeInTimezone(lastUpdated, timezone, {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: undefined,
                })}{' '}
                {getTimezoneAbbr(timezone)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={refreshing}
              className="min-h-9 rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              {refreshing ? 'Refreshing' : 'Refresh data'}
            </button>
          </div>
        </div>
      </header>

      {refreshError ? (
        <div
          role="status"
          className="mt-4 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {refreshError}
        </div>
      ) : null}

      <section aria-labelledby="market-tape-heading" className="mt-7">
        <SectionHeading
          title="Market Tape"
          meta={`${sparklineIndices.length} major markets`}
        />
        <div id="market-tape-heading" className="sr-only">
          Major market charts
        </div>
        {sparklineIndices.length > 0 ? (
          <IndexSparklines indices={sparklineIndices} />
        ) : (
          <DataUnavailable label="Major index" />
        )}
      </section>

      <section aria-labelledby="price-action-heading" className="mt-8">
        <SectionHeading title="Price Action" />
        <div id="price-action-heading" className="sr-only">
          Chart and market movers
        </div>
        <MarketTrendsCombined
          gainers={gainers}
          losers={losers}
          chartOfDaySpec={chartOfDaySpec}
        />
      </section>

      <section aria-labelledby="market-context-heading" className="mt-8">
        <SectionHeading title="Market Context" />
        <div id="market-context-heading" className="sr-only">
          Market context and watchlist
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
          <MarketInsights
            responsesApiBullets={responsesApiBullets}
            responsesLoading={responsesLoading}
            responsesError={responsesError}
            onRefreshResponses={() => void fetchResponsesBullets()}
            responsesGeneratedAt={responsesGeneratedAt}
            marketSummary={summaryBody}
            marketSummaryLoading={marketSummaryLoading}
            onRefreshSummary={() => void fetchSummary(true)}
            summaryLastUpdated={summaryLastUpdated}
          />
          {stocks.length > 0 ? (
            <StocksTable stocks={stocks} />
          ) : (
            <DataUnavailable label="Watchlist" />
          )}
        </div>
      </section>

      <section aria-labelledby="cross-asset-heading" className="mt-8">
        <SectionHeading title="Cross-Asset" />
        <div id="cross-asset-heading" className="sr-only">
          Futures, sectors, currencies, and rates
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {futures.length > 0 ? (
            <FuturesTable futures={futures} />
          ) : (
            <DataUnavailable label="Futures" />
          )}
          {sectors.length > 0 ? (
            <SectorHeatmap sectors={sectors} />
          ) : (
            <DataUnavailable label="Sector performance" />
          )}
          {forexBonds.length > 0 ? (
            <ForexBondsTable data={forexBonds} />
          ) : (
            <DataUnavailable label="Forex and rates" />
          )}
        </div>
      </section>

      <section aria-labelledby="catalysts-heading" className="mt-8">
        <SectionHeading title="Catalysts" />
        <div id="catalysts-heading" className="sr-only">
          Economic calendar, earnings, and headlines
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {economicEvents.length > 0 ? (
            <EconomicCalendar events={economicEvents} />
          ) : (
            <DataUnavailable label="Economic calendar" />
          )}
          {earnings.length > 0 ? (
            <EarningsCalendar
              earnings={earnings}
              totalCount={earningsTotalCount}
            />
          ) : (
            <DataUnavailable label="Earnings calendar" />
          )}
          {marketNews.length > 0 ? (
            <MarketHeadlines news={marketNews} />
          ) : (
            <DataUnavailable label="Market headlines" />
          )}
        </div>
      </section>

      <section aria-labelledby="flows-heading" className="mt-8">
        <SectionHeading title="Flows and Global Sessions" />
        <div id="flows-heading" className="sr-only">
          Insider activity and global market sessions
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.8fr)]">
          {largeInsiderTrades.length > 0 ? (
            <TopInsiderTrades trades={largeInsiderTrades} />
          ) : (
            <DataUnavailable label="Insider activity" />
          )}
          <MarketSessions
            hideTable
            indexQuotes={globalIndexQuotes}
            futuresQuotes={globalFuturesQuotes}
          />
        </div>
      </section>

      {sp500GainerSparklines.length > 0 ||
      sp500LoserSparklines.length > 0 ? (
        <section aria-labelledby="sp500-movers-heading" className="mt-8">
          <SectionHeading title="S&P 500 Movers" />
          <div id="sp500-movers-heading" className="sr-only">
            S&P 500 intraday mover charts
          </div>
          <TopGainerSparklines
            sparklines={sp500GainerSparklines}
            loserSparklines={sp500LoserSparklines}
          />
        </section>
      ) : null}
    </div>
  )
}
