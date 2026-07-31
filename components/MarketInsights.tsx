'use client'

import { useState, useEffect } from 'react'
import type { MarketTrendsBullet } from '@/app/actions/market-trends-responses'
import { TRENDS_LOADING_STEPS, TRENDS_LOADING_MESSAGES, type TrendsLoadingStep } from '@/lib/loading-steps'

function TrendsLoadingSteps({ loading }: { loading: boolean }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  useEffect(() => {
    if (!loading) {
      setCurrentStepIndex(0)
      setCompletedSteps([])
      return
    }

    // Progress through steps with realistic timing
    const timings = [600, 1200, 1500, 2500, 2000] // ms for each step
    let totalTime = 0

    const timeouts: NodeJS.Timeout[] = []

    timings.forEach((time, index) => {
      if (index < TRENDS_LOADING_STEPS.length - 1) {
        totalTime += time
        const timeout = setTimeout(() => {
          setCompletedSteps(prev => [...prev, index])
          setCurrentStepIndex(index + 1)
        }, totalTime)
        timeouts.push(timeout)
      }
    })

    return () => {
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [loading])

  if (!loading) return null

  return (
    <div className="space-y-1.5 py-2">
      {TRENDS_LOADING_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(index)
        const isCurrent = index === currentStepIndex
        const isPending = index > currentStepIndex

        return (
          <div key={step} className="flex items-center gap-2 text-xs">
            {isCompleted ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ) : isCurrent ? (
              <span className="w-3 h-3 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600" />
            )}
            <span className={`${
              isCompleted ? 'text-green-600 dark:text-green-400' :
              isCurrent ? 'text-sage-600 dark:text-sage-400 font-medium' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {TRENDS_LOADING_MESSAGES[step]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface MarketInsightsProps {
  responsesApiBullets?: MarketTrendsBullet[]
  responsesLoading?: boolean
  responsesError?: string
  onRefreshResponses?: () => void
  responsesGeneratedAt?: string
  marketSummary?: string
  marketSummaryLoading?: boolean
  onRefreshSummary?: () => void
  summaryLastUpdated?: Date | null
}

const SUMMARY_LINE_FILTERS = [
  /borrowing costs/i,
  /treasury|treasuries/i,
  /fed hold|fed rate|monetary policy/i,
  /employment situation/i,
]

function filterSummaryLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !SUMMARY_LINE_FILTERS.some((re) => re.test(line)))
    .map((line) => line.replace(/^\* /, ''))
    .join('\n')
}

function renderFormattedSummary(text: string) {
  text = filterSummaryLines(text)
  // Strip source link icons and surrounding parentheses, e.g. "( [↗](url) )" or "[↗](url)"
  text = text.replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)\s*/g, ' ')
  text = text.replace(/\s*\[[^\]]*\]\(https?:\/\/[^)]*\)\s*/g, ' ')
  // Clean up any leftover empty parens
  text = text.replace(/\(\s*\)/g, '')
  // Bold patterns
  const boldPattern = /(\*\*[^*]+\*\*)/g
  // Ticker indicators [[Name:+1.23%]]
  const tickerPattern = /\[\[([^\]:]+):([+-]?\d+\.?\d*%?)\]\]/g
  // Links [↗](url) or [text](url) format
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g

  const allPatterns: { start: number; end: number; element: React.ReactNode }[] = []

  let match
  while ((match = tickerPattern.exec(text)) !== null) {
    const name = match[1]
    const pct = match[2].includes('%') ? match[2] : `${match[2]}%`
    const numPct = parseFloat(pct)
    const isPos = numPct >= 0
    const colorClass = isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
    const borderClass = isPos ? 'border-green-500' : 'border-red-500'
    const arrow = isPos ? '\u25B2' : '\u25BC'
    allPatterns.push({
      start: match.index,
      end: match.index + match[0].length,
      element: (
        <span key={`t-${match.index}`} className="inline-flex items-center gap-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>
          <span className={`text-xs ${colorClass} border-b-2 ${borderClass} pb-0.5`}>{pct}{arrow}</span>
        </span>
      ),
    })
  }

  while ((match = linkPattern.exec(text)) !== null) {
    if (allPatterns.some((p) => match!.index >= p.start && match!.index < p.end)) continue
    const url = match[2]
    allPatterns.push({
      start: match.index,
      end: match.index + match[0].length,
      element: (
        <a key={`l-${match.index}`} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 ml-0.5" title="View source">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      ),
    })
  }

  allPatterns.sort((a, b) => a.start - b.start)

  const result: (string | React.ReactNode)[] = []
  let lastIndex = 0
  for (const pattern of allPatterns) {
    if (pattern.start > lastIndex) result.push(text.slice(lastIndex, pattern.start))
    result.push(pattern.element)
    lastIndex = pattern.end
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex))

  return result.map((segment, i) => {
    if (typeof segment !== 'string') return segment
    const boldParts = segment.split(boldPattern)
    return boldParts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${i}-${j}`}>{part.slice(2, -2)}</strong>
      return part
    })
  })
}

export default function MarketInsights({
  responsesApiBullets = [],
  responsesLoading = false,
  responsesError,
  onRefreshResponses,
  responsesGeneratedAt,
  marketSummary,
  marketSummaryLoading,
  onRefreshSummary,
  summaryLastUpdated,
}: MarketInsightsProps) {
  const HIDDEN_BULLET_TITLES = ['Worst Sector', 'Volatility Signal', 'Sector Rotation', 'Severe Stock Loss']

  const renderBulletList = (bullets: MarketTrendsBullet[], loading: boolean, error?: string, generatedAt?: string) => {
    bullets = bullets.filter(b => !HIDDEN_BULLET_TITLES.includes(b.title))
    if (loading) {
      return <TrendsLoadingSteps loading={loading} />
    }

    if (error) {
      return (
        <div className="py-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )
    }

    if (!bullets.length) {
      return (
        <div className="text-gray-400 italic text-sm py-4">
          No insights available. Click refresh to generate.
        </div>
      )
    }

    return (
      <div className="space-y-1.5">
        {bullets.map((bullet, index) => (
          <div
            key={index}
            className="flex items-start gap-2"
          >
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500"
            />
            <div className="min-w-0">
              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                {bullet.title}:
              </span>{' '}
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                {bullet.description}
              </span>
            </div>
          </div>
        ))}
        {generatedAt && (
          <div className="text-[9px] text-gray-400 pt-2">
            Generated: {new Date(generatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex min-h-11 items-center border-b border-gray-200 px-3 dark:border-gray-700">
        <div className="flex w-full items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Market Trends</h2>
          <button
            type="button"
            onClick={onRefreshResponses}
            disabled={responsesLoading}
            className="min-h-8 rounded border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {responsesLoading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* What's Happening Today */}
      {(marketSummary || marketSummaryLoading) && (
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="flex justify-between items-center mb-1.5">
            <div />
            <div className="flex items-center gap-2">
              {summaryLastUpdated && (
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  {summaryLastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              {onRefreshSummary && (
                <button
                  type="button"
                  onClick={onRefreshSummary}
                  disabled={marketSummaryLoading}
                  className="min-h-7 rounded border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {marketSummaryLoading ? 'Refreshing' : 'Refresh summary'}
                </button>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {marketSummaryLoading ? (
              <div className="py-1 text-xs text-gray-400 dark:text-gray-500">Loading...</div>
            ) : marketSummary ? (
              <div className="whitespace-pre-wrap">{renderFormattedSummary(marketSummary)}</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Bullet Points */}
      <div className="overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300">
        {renderBulletList(responsesApiBullets, responsesLoading, responsesError, responsesGeneratedAt)}
      </div>
    </div>
  )
}
