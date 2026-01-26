'use client'

import { type ReactNode, useState, useEffect } from 'react'
import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import { LOADING_STEPS, LOADING_MESSAGES, type LoadingStep } from '@/lib/loading-steps'

interface MarketTrendsCombinedProps {
  gainers: GainerData[]
  losers: LoserData[]
  sp500Losers?: LoserData[]
  marketSummary?: string
  marketSummaryLoading?: boolean
  onRefreshSummary?: () => void
  summaryLastUpdated?: Date | null
}


interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

function MiniTable({ title, stocks, colorMode }: { title: string; stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
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
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
          className="inline-flex items-center text-blue-500 hover:text-blue-600 ml-0.5"
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
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600" />
            )}
            <span className={`${
              isCompleted ? 'text-green-600 dark:text-green-400' :
              isCurrent ? 'text-blue-600 dark:text-blue-400 font-medium' :
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

function MarketSummaryCard({ summary, loading, onRefresh, lastUpdated }: { summary?: string; loading?: boolean; onRefresh?: () => void; lastUpdated?: Date | null }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
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
              className="text-[9px] px-2 py-0.5 rounded bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
      <div className="p-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed overflow-y-auto" style={{ maxHeight: '400px' }}>
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
  marketSummary,
  marketSummaryLoading,
  onRefreshSummary,
  summaryLastUpdated,
}: MarketTrendsCombinedProps) {
  const maxRows = 17

  return (
    <div className="flex gap-4 w-full">
      <MiniTable
        title="Gainers"
        stocks={gainers.slice(0, maxRows)}
        colorMode="green"
      />
      <MiniTable
        title="Losers"
        stocks={losers.slice(0, maxRows)}
        colorMode="red"
      />
      {sp500Losers && sp500Losers.length > 0 && (
        <MiniTable
          title="S&P 500 Losers"
          stocks={sp500Losers.slice(0, maxRows)}
          colorMode="red"
        />
      )}
      <MarketSummaryCard
        summary={marketSummary}
        loading={marketSummaryLoading}
        onRefresh={onRefreshSummary}
        lastUpdated={summaryLastUpdated}
      />
    </div>
  )
}
