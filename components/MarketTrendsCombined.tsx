'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AllSessionMoversResult, MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import {
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
} from '@/lib/dashboard/chart-of-the-day-spec'
import { resolveChartingPlatformDashboardFundamentalsSurfacePath } from '@/lib/newsletter/charting-platform-export'
import { useTheme } from '@/components/ThemeProvider'
import { useTimezone } from '@/lib/timezone-context'
import { getSessionTimeRange } from '@/lib/timezone-utils'
import TickerLink from '@/components/TickerLink'

type SessionType = 'premarket' | 'cash' | 'afterhours'
type ChartStatus = 'checking' | 'loading' | 'ready' | 'error'

interface MarketTrendsCombinedProps {
  gainers: AllSessionMoversResult
  losers: AllSessionMoversResult
  chartOfDaySpec: NewsletterChartSpec
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

function getDefaultSession(session: MarketSession): SessionType {
  return session === 'premarket' || session === 'afterhours'
    ? session
    : 'cash'
}

function getChartMetadata(spec: NewsletterChartSpec) {
  if ('stocks' in spec) {
    return {
      symbol: spec.stocks[0] ?? 'Market',
      detail: spec.title || spec.metrics.join(' / '),
    }
  }

  return {
    symbol: spec.symbol,
    detail: spec.title || 'Price',
  }
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

function ChartOfTheDay({
  chartOfDaySpec,
}: {
  chartOfDaySpec: NewsletterChartSpec
}) {
  const { theme } = useTheme()
  const metadata = getChartMetadata(chartOfDaySpec)
  const [status, setStatus] = useState<ChartStatus>('checking')
  const [frameNode, setFrameNode] = useState<HTMLDivElement | null>(null)
  const [frameSize, setFrameSize] = useState({
    width: DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
    height: DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  })

  const iframeSrc = useMemo(
    () =>
      resolveChartingPlatformDashboardFundamentalsSurfacePath(chartOfDaySpec, {
        width: Math.max(320, Math.round(frameSize.width)),
        height: Math.max(320, Math.round(frameSize.height)),
        theme: theme === 'dark' ? 'dark' : 'light',
      }),
    [chartOfDaySpec, frameSize.height, frameSize.width, theme],
  )

  useEffect(() => {
    if (!frameNode || typeof ResizeObserver === 'undefined') return

    const updateFrameSize = () => {
      const nextSize = {
        width: Math.max(320, frameNode.clientWidth),
        height: Math.max(320, frameNode.clientHeight),
      }
      setFrameSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      )
    }

    updateFrameSize()
    const observer = new ResizeObserver(updateFrameSize)
    observer.observe(frameNode)
    return () => observer.disconnect()
  }, [frameNode])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)

    setStatus('checking')

    fetch(iframeSrc, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Chart surface returned ${response.status}`)
        }
        setStatus('loading')
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('error')
        }
      })
      .finally(() => {
        window.clearTimeout(timeout)
      })

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [iframeSrc])

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:min-h-[500px] lg:min-h-[590px]">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
            Chart of the Day
          </h2>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {metadata.symbol} · {metadata.detail}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              status === 'ready'
                ? 'bg-emerald-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'animate-pulse bg-amber-500'
            }`}
          />
          {status === 'ready'
            ? 'Live'
            : status === 'error'
              ? 'Unavailable'
              : 'Loading'}
        </div>
      </div>

      <div
        ref={setFrameNode}
        className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-900"
      >
        {status === 'loading' || status === 'ready' ? (
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title="Chart of the Day"
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-200 ${
              status === 'ready' ? 'opacity-100' : 'opacity-0'
            }`}
            loading="eager"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            style={{ pointerEvents: 'none' }}
          />
        ) : null}

        {status === 'checking' || status === 'loading' ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400"
          >
            Loading chart
          </div>
        ) : null}

        {status === 'error' ? (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Chart temporarily unavailable
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
              The rest of the market overview remains current.
            </p>
            <TickerLink
              symbol={metadata.symbol}
              className="mt-4 inline-flex rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium no-underline hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
              title={`Open ${metadata.symbol} financials`}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function MoversTable({
  title,
  rows,
  tone,
  session,
}: {
  title: string
  rows: MoverData[]
  tone: 'positive' | 'negative'
  session: SessionType
}) {
  const sessionLabel =
    session === 'premarket'
      ? 'pre-market'
      : session === 'afterhours'
        ? 'after-hours'
        : 'regular session'

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-11 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {rows.length}
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
              rows.slice(0, 12).map((stock) => (
                <tr
                  key={stock.symbol}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/70"
                >
                  <td className="px-3 py-2">
                    <TickerLink
                      symbol={stock.symbol}
                      className="font-semibold text-gray-950 no-underline hover:text-sage-700 dark:text-gray-100 dark:hover:text-sage-300"
                    />
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function MarketTrendsCombined({
  gainers,
  losers,
  chartOfDaySpec,
}: MarketTrendsCombinedProps) {
  const { timezone } = useTimezone()
  const [selectedSession, setSelectedSession] = useState<SessionType>(() =>
    getDefaultSession(gainers.currentSession),
  )

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(420px,1fr)]">
      <ChartOfTheDay chartOfDaySpec={chartOfDaySpec} />

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
          <SessionToggle
            selected={selectedSession}
            onChange={setSelectedSession}
            currentSession={gainers.currentSession}
            timezone={timezone}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MoversTable
            title="Gainers"
            rows={gainers[selectedSession] ?? []}
            tone="positive"
            session={selectedSession}
          />
          <MoversTable
            title="Losers"
            rows={losers[selectedSession] ?? []}
            tone="negative"
            session={selectedSession}
          />
        </div>
      </section>
    </div>
  )
}
