'use client'

import { useMemo, type ReactNode } from 'react'
import CatalystTimeline from '@/components/CatalystTimeline'
import ForexBondsTable from '@/components/ForexBondsTable'
import FuturesTable from '@/components/FuturesTable'
import IndexSparklines from '@/components/IndexSparklines'
import MarketInsights from '@/components/MarketInsights'
import MarketSessions from '@/components/MarketSessions'
import MarketTrendsCombined from '@/components/MarketTrendsCombined'
import SectorHeatmap from '@/components/SectorHeatmap'
import StocksTable from '@/components/StocksTable'
import TopGainerSparklines from '@/components/TopGainerSparklines'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import { useAccountWatchlist } from '@/components/useAccountWatchlist'
import { useDashboardPreferences } from '@/components/useDashboardPreferences'
import type { MarketTrendsBullet } from '@/app/actions/market-trends-responses'
import type { AllMarketData } from '@/lib/market-types'
import type { DashboardChartOfTheDayPresentation } from '@/lib/dashboard/chart-of-the-day-presentation'
import type { DashboardSnapshotCaptureTimes } from '@/lib/dashboard-snapshot-provenance'
import { useDashboardMarketSnapshots } from '@/lib/hooks/use-dashboard-market-snapshots'
import { getTimezoneAbbr, useTimezone } from '@/lib/timezone-context'
import { formatTimeInTimezone } from '@/lib/timezone-utils'

interface MarketDashboardSundayProps {
  initialData: AllMarketData
  initialCaptureTimes: DashboardSnapshotCaptureTimes
  chartOfDayPresentation: DashboardChartOfTheDayPresentation
  initialRenderedAt: string
}

const SESSION_LABELS = {
  premarket: 'Pre-market',
  cash: 'Regular session',
  afterhours: 'After-hours',
  closed: 'Markets closed',
} as const

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

function SectionControl({
  expanded,
  onClick,
  compactLabel = 'Show notable',
  expandedLabel = 'View all',
}: {
  expanded: boolean
  onClick: () => void
  compactLabel?: string
  expandedLabel?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className="rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white"
    >
      {expanded ? compactLabel : expandedLabel}
    </button>
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
  initialCaptureTimes,
  chartOfDayPresentation,
  initialRenderedAt,
}: MarketDashboardSundayProps) {
  const { timezone } = useTimezone()
  const { preferences, setPreference, loaded: preferencesLoaded } = useDashboardPreferences()
  const accountWatchlist = useAccountWatchlist({
    localSymbols: preferences.watchlistSymbols,
    localLoaded: preferencesLoaded,
    onLocalSymbolsChange: (symbols) => setPreference('watchlistSymbols', symbols),
  })
  const {
    data,
    freshness,
    clockAt,
    refreshing,
    refreshError,
    refreshDashboard,
  } = useDashboardMarketSnapshots(
    initialData,
    initialCaptureTimes,
    initialRenderedAt,
  )
  const marketSummary = initialData.marketSummary || ''
  const responsesApiBullets: MarketTrendsBullet[] =
    initialData.marketTrendsBullets || []

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
    sp500GainerSparklines,
    sp500LoserSparklines,
    forexBonds,
    largeInsiderTrades,
    globalIndexQuotes,
    globalFuturesQuotes,
  } = data

  const clockDate = new Date(clockAt)
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  }).format(clockDate)
  const formatCapturedTime = (capturedAt: string) =>
    `${formatTimeInTimezone(new Date(capturedAt), timezone, {
      hour: 'numeric',
      minute: '2-digit',
      second: undefined,
    })} ${getTimezoneAbbr(timezone)}`
  const fastUpdatedTime = formatCapturedTime(freshness.fastCapturedAt)
  const slowUpdatedTime = formatCapturedTime(freshness.slowCapturedAt)
  const globalLoadedTime = formatCapturedTime(freshness.globalLoadedAt)
  const fastPartialLabel =
    freshness.fastDegradedSections.length > 0 ? ' · partial' : ''
  const slowPartialLabel =
    freshness.slowDegradedSections.length > 0 ? ' · partial' : ''
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
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
              Prices {fastUpdatedTime}{fastPartialLabel} · Slow data {slowUpdatedTime}{slowPartialLabel}
            </span>
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
          meta={`${sparklineIndices.length} markets · Quotes ${fastUpdatedTime}${fastPartialLabel}`}
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
        <SectionHeading
          title="Price Action"
          meta={`Quotes ${fastUpdatedTime}${fastPartialLabel}`}
        />
        <div id="price-action-heading" className="sr-only">
          Chart and market movers
        </div>
        <MarketTrendsCombined
          gainers={gainers}
          losers={losers}
          chartOfDayPresentation={chartOfDayPresentation}
          preferredSession={preferences.moverSession}
          onSessionChange={(session) => setPreference('moverSession', session)}
        />
      </section>

      <section aria-labelledby="market-context-heading" className="mt-8">
        <SectionHeading
          title="Market Context"
          meta={`AI context cached · Watchlist ${fastUpdatedTime}${fastPartialLabel}`}
        />
        <div id="market-context-heading" className="sr-only">
          Market context and watchlist
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
          <MarketInsights
            responsesApiBullets={responsesApiBullets}
            responsesLoading={false}
            marketTakeaway={summaryHeadline}
            marketSummary={summaryBody}
            marketSummaryLoading={false}
          />
          <StocksTable
            stocks={stocks}
            symbols={accountWatchlist.symbols}
            onSymbolsChange={accountWatchlist.setSymbols}
            editingDisabled={!accountWatchlist.canEdit}
            syncStatus={accountWatchlist.status}
            syncMessage={accountWatchlist.message}
            syncCacheAvailable={accountWatchlist.cacheAvailable}
            syncCanRetry={accountWatchlist.canRetry}
            onSyncRetry={accountWatchlist.retry}
          />
        </div>
      </section>

      <section aria-labelledby="cross-asset-heading" className="mt-8">
        <SectionHeading
          title="Cross-Asset"
          meta={(
            <div className="flex items-center gap-3">
              <span>Snapshot {slowUpdatedTime}{slowPartialLabel}</span>
              <SectionControl
                expanded={preferences.crossAssetExpanded}
                onClick={() => setPreference('crossAssetExpanded', !preferences.crossAssetExpanded)}
              />
            </div>
          )}
        />
        <div id="cross-asset-heading" className="sr-only">
          Futures, sectors, currencies, and rates
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {futures.length > 0 ? (
            <FuturesTable futures={futures} compact={!preferences.crossAssetExpanded} />
          ) : (
            <DataUnavailable label="Futures" />
          )}
          {sectors.length > 0 ? (
            <SectorHeatmap sectors={sectors} compact={!preferences.crossAssetExpanded} />
          ) : (
            <DataUnavailable label="Sector performance" />
          )}
          {forexBonds.length > 0 ? (
            <ForexBondsTable data={forexBonds} compact={!preferences.crossAssetExpanded} />
          ) : (
            <DataUnavailable label="Forex and rates" />
          )}
        </div>
      </section>

      <section aria-labelledby="catalysts-heading" className="mt-8">
        <SectionHeading
          title="Catalysts"
          meta={`Calendar and news · ${slowUpdatedTime}${slowPartialLabel}`}
        />
        <div id="catalysts-heading" className="sr-only">
          Economic calendar, earnings, and headlines
        </div>
        {economicEvents.length > 0 || earnings.length > 0 || marketNews.length > 0 ? (
          <CatalystTimeline
            economicEvents={economicEvents}
            earnings={earnings}
            news={marketNews}
            referenceTime={clockAt}
          />
        ) : (
          <DataUnavailable label="Catalyst" />
        )}
      </section>

      <section aria-labelledby="flows-heading" className="mt-8">
        <SectionHeading
          title="Flows and Global Sessions"
          meta={(
            <div className="flex items-center gap-3">
              <span>
                Filings {slowUpdatedTime}{slowPartialLabel} · Global quotes loaded {globalLoadedTime}
              </span>
              <SectionControl
                expanded={preferences.flowsExpanded}
                compactLabel="Collapse"
                expandedLabel="View details"
                onClick={() => setPreference('flowsExpanded', !preferences.flowsExpanded)}
              />
            </div>
          )}
        />
        <div id="flows-heading" className="sr-only">
          Insider activity and global market sessions
        </div>
        {preferences.flowsExpanded ? (
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
        ) : (
          <button
            type="button"
            onClick={() => setPreference('flowsExpanded', true)}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-4 text-left hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
          >
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                {largeInsiderTrades.length} notable insider trades · {globalIndexQuotes.length + globalFuturesQuotes.length} global markets
              </span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Open the filing table and global-session timeline.
              </span>
            </span>
            <span aria-hidden="true" className="text-gray-400">→</span>
          </button>
        )}
      </section>

      {sp500GainerSparklines.length > 0 ||
      sp500LoserSparklines.length > 0 ? (
        <section aria-labelledby="sp500-movers-heading" className="mt-8">
          <SectionHeading
            title="S&P 500 Movers"
            meta={(
              <SectionControl
                expanded={preferences.sp500MoversExpanded}
                compactLabel="Collapse"
                expandedLabel="View charts"
                onClick={() => setPreference('sp500MoversExpanded', !preferences.sp500MoversExpanded)}
              />
            )}
          />
          <div id="sp500-movers-heading" className="sr-only">
            S&P 500 intraday mover charts
          </div>
          {preferences.sp500MoversExpanded ? (
            <TopGainerSparklines
              sparklines={sp500GainerSparklines}
              loserSparklines={sp500LoserSparklines}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPreference('sp500MoversExpanded', true)}
              className="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-4 text-left hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
            >
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">
                  {sp500GainerSparklines.length} gainers · {sp500LoserSparklines.length} losers
                </span>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  Intraday charts are tucked away until you need the detail.
                </span>
              </span>
              <span aria-hidden="true" className="text-gray-400">→</span>
            </button>
          )}
        </section>
      ) : null}
    </div>
  )
}
