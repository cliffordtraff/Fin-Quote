'use client'

import { Fragment, useEffect, useState } from 'react'
import type { AllSessionMoversResult, MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'
import type { DashboardChartOfTheDayPresentation } from '@/lib/dashboard/chart-of-the-day-presentation'
import { normalizeExternalHttpUrl } from '@/lib/safe-url'
import { useTimezone } from '@/lib/timezone-context'
import { getSessionTimeRange } from '@/lib/timezone-utils'
import DashboardChartOfTheDay from '@/components/DashboardChartOfTheDay'
import TickerLink from '@/components/TickerLink'

type SessionType = 'premarket' | 'cash' | 'afterhours'

type MoverReason = {
  symbol: string
  status: 'found' | 'not_found' | 'error'
  reason: string | null
  sourceUrl: string | null
}

interface MarketTrendsCombinedProps {
  gainers: AllSessionMoversResult
  losers: AllSessionMoversResult
  chartOfDayPresentation: DashboardChartOfTheDayPresentation
  preferredSession?: SessionType | null
  onSessionChange?: (session: SessionType) => void
}

const SESSION_OPTIONS: Array<{
  id: SessionType
  label: string
  fullName: string
}> = [
  { id: 'premarket', label: 'Pre', fullName: 'Pre-market' },
  { id: 'cash', label: 'Regular', fullName: 'Regular session' },
  { id: 'afterhours', label: 'After', fullName: 'After-hours' },
]

const DEFAULT_VISIBLE_MOVERS = 8

function getDefaultSession(session: MarketSession): SessionType {
  return session === 'premarket' || session === 'afterhours'
    ? session
    : 'cash'
}

function SessionToggle({
  selected,
  onChange,
  currentSession,
  timezone,
}: {
  selected: SessionType
  onChange: (session: SessionType) => void
  currentSession: MarketSession
  timezone: string
}) {
  return (
    <div
      aria-label="Market session"
      className="grid grid-cols-3 rounded border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-900"
      role="group"
    >
      {SESSION_OPTIONS.map((session) => {
        const isActive = selected === session.id
        const isLive = currentSession === session.id

        return (
          <button
            key={session.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(session.id)}
            title={`${session.fullName}: ${getSessionTimeRange(session.id, timezone)}`}
            className={`relative min-h-8 whitespace-nowrap rounded px-2 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {session.label}
            {isLive ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
                <span className="sr-only"> live</span>
              </>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function MoversTable({
  title,
  rows,
  tone,
  session,
  showAll,
  reasons,
  loadingReasonSymbols,
  expandedReasonSymbol,
  onToggleReason,
}: {
  title: string
  rows: MoverData[]
  tone: 'positive' | 'negative'
  session: SessionType
  showAll: boolean
  reasons: Record<string, MoverReason>
  loadingReasonSymbols: Set<string>
  expandedReasonSymbol: string | null
  onToggleReason: (symbol: string) => void
}) {
  const sessionLabel =
    session === 'premarket'
      ? 'pre-market'
      : session === 'afterhours'
        ? 'after-hours'
        : 'regular session'
  const visibleRows = showAll ? rows : rows.slice(0, DEFAULT_VISIBLE_MOVERS)

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-11 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {visibleRows.length} / {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[190px] text-xs">
          <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ticker</th>
              <th className="px-2 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No {sessionLabel} data
                </td>
              </tr>
            ) : (
              visibleRows.map((stock) => {
                const symbol = stock.symbol.toUpperCase()
                const reason = reasons[symbol]
                const sourceUrl = normalizeExternalHttpUrl(reason?.sourceUrl)
                const isExpanded = expandedReasonSymbol === symbol
                const reasonId = `${title.toLowerCase()}-${symbol}-reason`

                return (
                  <Fragment key={symbol}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/70">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <TickerLink
                            symbol={stock.symbol}
                            className="font-semibold text-gray-950 no-underline hover:text-sage-700 dark:text-gray-100 dark:hover:text-sage-300"
                          />
                          <button
                            type="button"
                            aria-label={`Why is ${symbol} moving?`}
                            aria-controls={reasonId}
                            aria-expanded={isExpanded}
                            onClick={() => onToggleReason(symbol)}
                            className="text-[10px] font-medium text-gray-400 transition-colors hover:text-sage-700 dark:text-gray-500 dark:hover:text-sage-300"
                          >
                            Why?
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        ${stock.price.toFixed(2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${
                          tone === 'positive'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {stock.changesPercentage > 0 ? '+' : ''}
                        {stock.changesPercentage.toFixed(2)}%
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr id={reasonId}>
                        <td
                          colSpan={3}
                          className="bg-gray-50 px-3 py-2.5 text-xs leading-5 dark:bg-gray-800/60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <ReasonText
                              reason={reason}
                              loading={loadingReasonSymbols.has(symbol)}
                            />
                            {sourceUrl && reason?.reason ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-[10px] font-medium text-gray-400 no-underline hover:text-sage-700 dark:text-gray-500 dark:hover:text-sage-300"
                              >
                                Source ↗
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReasonText({
  reason,
  loading,
}: {
  reason?: MoverReason
  loading: boolean
}) {
  if (loading) {
    return (
      <span className="block h-4 w-full max-w-[20rem] animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
    )
  }

  if (reason?.reason) {
    return (
      <span className="text-gray-700 dark:text-gray-300">
        {reason.reason}
      </span>
    )
  }

  return (
    <span className="text-gray-500 dark:text-gray-500">
      No fresh catalyst found.
    </span>
  )
}

export default function MarketTrendsCombined({
  gainers,
  losers,
  chartOfDayPresentation,
  preferredSession,
  onSessionChange,
}: MarketTrendsCombinedProps) {
  const { timezone } = useTimezone()
  const [selectedSession, setSelectedSession] = useState<SessionType>(() =>
    getDefaultSession(gainers.currentSession),
  )
  const [showAll, setShowAll] = useState(false)
  const [expandedReasonSymbol, setExpandedReasonSymbol] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, MoverReason>>({})
  const [loadingReasonSymbols, setLoadingReasonSymbols] = useState<Set<string>>(
    () => new Set(),
  )
  const activeGainers = gainers[selectedSession] ?? []
  const activeLosers = losers[selectedSession] ?? []
  const maxMoverCount = Math.max(activeGainers.length, activeLosers.length)

  useEffect(() => {
    if (preferredSession) {
      setSelectedSession(preferredSession)
    }
  }, [preferredSession])

  async function loadReason(symbol: string) {
    if (reasons[symbol] || loadingReasonSymbols.has(symbol)) return

    setLoadingReasonSymbols((current) => new Set(current).add(symbol))

    try {
      const response = await fetch('/api/stock-why-moving/batch', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol] }),
      })
      if (!response.ok) throw new Error(`Reason returned ${response.status}`)
      const payload = (await response.json()) as {
        reasons?: Record<string, MoverReason>
      }
      setReasons((current) => ({
        ...current,
        ...(payload.reasons ?? {}),
      }))
    } catch {
      setReasons((current) => ({
        ...current,
        [symbol]: {
          symbol,
          status: 'error',
          reason: null,
          sourceUrl: null,
        },
      }))
    } finally {
      setLoadingReasonSymbols((current) => {
        const next = new Set(current)
        next.delete(symbol)
        return next
      })
    }
  }

  function toggleReason(symbol: string) {
    const nextSymbol = expandedReasonSymbol === symbol ? null : symbol
    setExpandedReasonSymbol(nextSymbol)
    if (nextSymbol) {
      void loadReason(nextSymbol)
    }
  }

  function changeSession(session: SessionType) {
    setSelectedSession(session)
    onSessionChange?.(session)
    setShowAll(false)
    setExpandedReasonSymbol(null)
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(420px,1fr)]">
      <DashboardChartOfTheDay presentation={chartOfDayPresentation} />

      <section className="min-w-0">
        <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
              Session Movers
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Ranked by percentage move
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {maxMoverCount > DEFAULT_VISIBLE_MOVERS ? (
              <button
                type="button"
                onClick={() => {
                  setShowAll((current) => !current)
                  setExpandedReasonSymbol(null)
                }}
                className="min-h-8 px-1 text-xs font-medium text-gray-500 hover:text-sage-700 dark:text-gray-400 dark:hover:text-sage-300"
              >
                {showAll ? 'Show top 8' : `View all ${maxMoverCount}`}
              </button>
            ) : null}
            <SessionToggle
              selected={selectedSession}
              onChange={changeSession}
              currentSession={gainers.currentSession}
              timezone={timezone}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MoversTable
            title="Gainers"
            rows={activeGainers}
            tone="positive"
            session={selectedSession}
            showAll={showAll}
            reasons={reasons}
            loadingReasonSymbols={loadingReasonSymbols}
            expandedReasonSymbol={expandedReasonSymbol}
            onToggleReason={toggleReason}
          />
          <MoversTable
            title="Losers"
            rows={activeLosers}
            tone="negative"
            session={selectedSession}
            showAll={showAll}
            reasons={reasons}
            loadingReasonSymbols={loadingReasonSymbols}
            expandedReasonSymbol={expandedReasonSymbol}
            onToggleReason={toggleReason}
          />
        </div>
      </section>
    </div>
  )
}
