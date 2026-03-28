'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { LoserData } from '@/app/actions/losers'
import type { AllSessionMoversResult } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'
import { LOADING_STEPS, LOADING_MESSAGES } from '@/lib/loading-steps'
import { useTheme } from '@/components/ThemeProvider'
import { useTimezone } from '@/lib/timezone-context'
import { getSessionTimeRange } from '@/lib/timezone-utils'
import {
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
} from '@/lib/dashboard/chart-of-the-day-spec'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import { resolveChartingPlatformDashboardFundamentalsSurfacePath } from '@/lib/newsletter/charting-platform-export'

type SessionType = 'premarket' | 'cash' | 'afterhours'

interface MarketTrendsCombinedProps {
  gainers: AllSessionMoversResult
  losers: AllSessionMoversResult
  sp500Losers?: LoserData[]
  chartOfDaySpec: NewsletterChartSpec
}

interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

function SessionToggle({
  selected,
  onChange,
  currentSession,
  timezone
}: {
  selected: SessionType
  onChange: (session: SessionType) => void
  currentSession: MarketSession
  timezone: string
}) {
  const sessions: { id: SessionType; label: string; fullName: string }[] = [
    { id: 'premarket', label: 'Pre', fullName: 'Pre-market' },
    { id: 'cash', label: 'Reg', fullName: 'Regular' },
    { id: 'afterhours', label: 'AH', fullName: 'After-hours' }
  ]

  return (
    <div className="flex rounded bg-cream-50 dark:bg-gray-800 p-0.5">
      {sessions.map((session) => {
        const isActive = selected === session.id
        const isLive = currentSession === session.id
        const timeRange = getSessionTimeRange(session.id, timezone)

        return (
          <button
            key={session.id}
            onClick={() => onChange(session.id)}
            title={`${session.fullName}: ${timeRange}`}
            className={`
              relative px-2.5 py-1 text-[11px] font-medium rounded transition-colors
              ${isActive
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }
            `}
          >
            {session.label}
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function MiniTable({ title, stocks, colorMode }: { title: string; stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-cream-300 dark:border-gray-700">
            <th className="text-left py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Price</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Chg%</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const isPositive = stock.changesPercentage >= 0
            let changeColor: string
            if (colorMode === 'green') {
              changeColor = 'text-green-600 dark:text-green-400'
            } else if (colorMode === 'red') {
              changeColor = 'text-red-600 dark:text-red-400'
            } else {
              changeColor = isPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }

            return (
              <tr
                key={stock.symbol}
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-cream-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1 px-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                </td>
                <td className="py-1 px-2 text-right text-gray-900 dark:text-gray-100">
                  ${stock.price.toFixed(2)}
                </td>
                <td className={`py-1 px-2 text-right font-medium ${changeColor}`}>
                  {isPositive ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TickerIndicator({ name, percentage }: { name: string; percentage: string }) {
  const numPercent = parseFloat(percentage)
  const isPositive = numPercent >= 0
  const colorClass = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  const borderClass = isPositive ? 'border-green-500' : 'border-red-500'
  const arrow = isPositive ? '▲' : '▼'

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>
      <span className={`text-xs ${colorClass} border-b-2 ${borderClass} pb-0.5`}>
        {percentage}{arrow}
      </span>
    </span>
  )
}

function renderFormattedText(text: string) {
  // Pattern for ticker indicators [[Name:+1.23%]]
  const tickerPattern = /\[\[([^\]:]+):([+-]?\d+\.?\d*%?)\]\]/g
  // Links [↗](url) or [text](url) format
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
  // Bold patterns
  const boldPattern = /(\*\*[^*]+\*\*)/g

  // First pass: extract all special patterns with their positions
  const allPatterns: { start: number; end: number; element: ReactNode }[] = []

  // Find ticker indicators
  let match
  while ((match = tickerPattern.exec(text)) !== null) {
    const name = match[1]
    const percentage = match[2].includes('%') ? match[2] : `${match[2]}%`
    allPatterns.push({
      start: match.index,
      end: match.index + match[0].length,
      element: <TickerIndicator key={`ticker-${match.index}`} name={name} percentage={percentage} />
    })
  }

  // Find links
  while ((match = linkPattern.exec(text)) !== null) {
    const url = match[2]
    allPatterns.push({
      start: match.index,
      end: match.index + match[0].length,
      element: (
        <a
          key={`link-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 ml-0.5"
          title="View source"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )
    })
  }

  // Sort by position
  allPatterns.sort((a, b) => a.start - b.start)

  // Build result with gaps filled by text
  const result: (string | ReactNode)[] = []
  let lastIndex = 0

  for (const pattern of allPatterns) {
    if (pattern.start > lastIndex) {
      result.push(text.slice(lastIndex, pattern.start))
    }
    result.push(pattern.element)
    lastIndex = pattern.end
  }
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }

  // Process remaining string segments for bold
  return result.map((segment, i) => {
    if (typeof segment !== 'string') return segment

    const boldParts = segment.split(boldPattern)
    return boldParts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={`${i}-${j}`}>{part.slice(2, -2)}</strong>
      }
      // Convert "* " at start of line to bullet point
      if (part.includes('\n* ') || part.startsWith('* ')) {
        return part.split(/(\n?\* )/).map((subpart, k) => {
          if (subpart === '* ' || subpart === '\n* ') {
            return <span key={`${i}-${j}-${k}`}>{subpart.startsWith('\n') ? '\n' : ''}• </span>
          }
          return subpart
        })
      }
      return part
    })
  })
}

function LoadingSteps({ loading }: { loading: boolean }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [showAnimation, setShowAnimation] = useState(false)

  useEffect(() => {
    if (!loading) {
      setCurrentStepIndex(0)
      setCompletedSteps([])
      setShowAnimation(false)
      return
    }

    // Only show animation if loading persists for more than 500ms
    // This prevents showing animation for fast cache hits
    const showTimeout = setTimeout(() => {
      setShowAnimation(true)
    }, 500)

    // Progress through steps with realistic timing
    const timings = [800, 1500, 3000, 2000, 2500] // ms for each step
    let totalTime = 0

    const timeouts: NodeJS.Timeout[] = []

    timings.forEach((time, index) => {
      if (index < LOADING_STEPS.length - 1) {
        totalTime += time
        const timeout = setTimeout(() => {
          setCompletedSteps(prev => [...prev, index])
          setCurrentStepIndex(index + 1)
        }, totalTime)
        timeouts.push(timeout)
      }
    })

    return () => {
      clearTimeout(showTimeout)
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [loading])

  // Don't show animation if loading was very brief (likely cache hit)
  if (!loading || !showAnimation) {
    return loading ? (
      <div className="py-4 text-xs text-gray-400 dark:text-gray-500">Loading...</div>
    ) : null
  }

  return (
    <div className="space-y-2 py-4">
      {LOADING_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(index)
        const isCurrent = index === currentStepIndex
        const isPending = index > currentStepIndex

        return (
          <div key={step} className="flex items-center gap-2 text-xs">
            {isCompleted ? (
              <span className="text-green-500 w-4">✓</span>
            ) : isCurrent ? (
              <span className="w-4 h-4 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600" />
            )}
            <span className={`${
              isCompleted ? 'text-green-600 dark:text-green-400' :
              isCurrent ? 'text-sage-600 dark:text-sage-400 font-medium' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {LOADING_MESSAGES[step]}
            </span>
          </div>
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
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [frameNode, setFrameNode] = useState<HTMLDivElement | null>(null)
  const [frameSize, setFrameSize] = useState({
    width: DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
    height: DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  })
  const panelClasses =
    theme === 'dark'
      ? 'border-[#334155] bg-[#1f2937]'
      : 'border-cream-300 bg-white'
  const headerClasses =
    theme === 'dark'
      ? 'border-[#334155] bg-[#1f2937]'
      : 'border-cream-300 bg-cream-50'
  const frameClasses =
    theme === 'dark'
      ? 'border-0 bg-[#1f2937]'
      : 'border-cream-200 bg-white'
  const iframeSrc = useMemo(
    () =>
      resolveChartingPlatformDashboardFundamentalsSurfacePath(chartOfDaySpec, {
        width: Math.max(320, Math.round(frameSize.width)),
        height: Math.max(280, Math.round(frameSize.height)),
        theme: theme === 'dark' ? 'dark' : 'light',
      }),
    [chartOfDaySpec, frameSize.height, frameSize.width, theme],
  )

  useEffect(() => {
    setStatus('loading')
  }, [iframeSrc])

  useEffect(() => {
    if (!frameNode || typeof ResizeObserver === 'undefined') return

    const updateFrameSize = () => {
      const nextWidth = Math.max(320, frameNode.clientWidth)
      const nextHeight = Math.max(280, frameNode.clientHeight)
      setFrameSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      )
    }

    updateFrameSize()

    const observer = new ResizeObserver(() => {
      updateFrameSize()
    })

    observer.observe(frameNode)
    return () => observer.disconnect()
  }, [frameNode])

  return (
    <div className={`flex-[2] min-h-[620px] rounded-lg border overflow-hidden flex flex-col ${panelClasses}`}>
      <div className={`px-2 py-1.5 border-b ${headerClasses}`}>
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Chart of the Day</h2>
      </div>
      <div className="flex-1 min-h-0">
        <div
          ref={setFrameNode}
          className={`relative h-full min-h-[580px] overflow-hidden ${frameClasses}`}
        >
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title="Chart of the day"
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-150 ${
              status === 'ready' ? 'opacity-100' : 'opacity-0'
            }`}
            loading="eager"
            onLoad={() => setStatus('ready')}
            style={{ pointerEvents: 'none' }}
          />

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
              Loading chart...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MarketSummaryCard({ summary, loading, onRefresh, lastUpdated }: { summary?: string; loading?: boolean; onRefresh?: () => void; lastUpdated?: Date | null }) {
  return (
    <div className="rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800 flex justify-between items-center">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">What&apos;s Happening Today</h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[9px] text-gray-500 dark:text-gray-400">
              {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-[9px] px-2 py-0.5 rounded bg-sage-500 hover:bg-sage-600 disabled:bg-gray-400 text-white"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
      <div className="p-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed overflow-y-auto" style={{ maxHeight: '340px' }}>
        {loading ? (
          <LoadingSteps loading={loading} />
        ) : summary ? (
          <div className="whitespace-pre-wrap">{renderFormattedText(summary)}</div>
        ) : (
          <div className="text-gray-400 italic">Market summary unavailable</div>
        )}
      </div>
    </div>
  )
}

export default function MarketTrendsCombined({
  gainers,
  losers,
  sp500Losers,
  chartOfDaySpec,
}: MarketTrendsCombinedProps) {
  const maxRows = 12
  const { timezone } = useTimezone()

  // Default to current session, fallback to 'cash' if market closed
  const getDefaultSession = (): SessionType => {
    if (gainers.currentSession === 'premarket') return 'premarket'
    if (gainers.currentSession === 'cash') return 'cash'
    if (gainers.currentSession === 'afterhours') return 'afterhours'
    return 'cash'
  }

  const [selectedSession, setSelectedSession] = useState<SessionType>(getDefaultSession)

  // Get the data for the selected session
  const gainersData = gainers[selectedSession] || []
  const losersData = losers[selectedSession] || []

  return (
    <div className="flex gap-4 w-full">
      <ChartOfTheDay chartOfDaySpec={chartOfDaySpec} />
      <div className="w-[220px] shrink-0 rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-2 py-1.5 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800 flex justify-between items-center">
          <h2 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">Gainers</h2>
          <SessionToggle
            selected={selectedSession}
            onChange={setSelectedSession}
            currentSession={gainers.currentSession}
            timezone={timezone}
          />
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-cream-300 dark:border-gray-700">
              <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
              <th className="text-right py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Price</th>
              <th className="text-right py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Chg%</th>
            </tr>
          </thead>
          <tbody>
            {gainersData.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-2 text-center text-[13px] text-gray-400 dark:text-gray-500">
                  No data for {selectedSession === 'premarket' ? 'pre-market' : selectedSession === 'afterhours' ? 'after-hours' : 'regular'} session
                </td>
              </tr>
            ) : (
              gainersData.slice(0, maxRows).map((stock) => (
                <tr
                  key={stock.symbol}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-cream-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-1.5 px-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-900 dark:text-gray-100">
                    ${stock.price.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium text-green-600 dark:text-green-400">
                    +{stock.changesPercentage.toFixed(2)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="w-[220px] shrink-0 rounded-lg border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-2 py-1.5 border-b border-cream-300 dark:border-gray-700 bg-cream-50 dark:bg-gray-800 flex justify-between items-center">
          <h2 className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">Losers</h2>
          <SessionToggle
            selected={selectedSession}
            onChange={setSelectedSession}
            currentSession={losers.currentSession}
            timezone={timezone}
          />
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-cream-300 dark:border-gray-700">
              <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
              <th className="text-right py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Price</th>
              <th className="text-right py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Chg%</th>
            </tr>
          </thead>
          <tbody>
            {losersData.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-2 text-center text-[13px] text-gray-400 dark:text-gray-500">
                  No data for {selectedSession === 'premarket' ? 'pre-market' : selectedSession === 'afterhours' ? 'after-hours' : 'regular'} session
                </td>
              </tr>
            ) : (
              losersData.slice(0, maxRows).map((stock) => (
                <tr
                  key={stock.symbol}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-cream-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-1.5 px-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-900 dark:text-gray-100">
                    ${stock.price.toFixed(2)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium text-red-600 dark:text-red-400">
                    {stock.changesPercentage.toFixed(2)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
