'use client'

import type { MarketTrendsBullet } from '@/app/actions/market-trends-responses'

interface MarketInsightsProps {
  responsesApiBullets?: MarketTrendsBullet[]
  responsesLoading?: boolean
  responsesError?: string
  onRefreshResponses?: () => void
  marketTakeaway?: string
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
  marketTakeaway,
  marketSummary,
  marketSummaryLoading,
  onRefreshSummary,
  summaryLastUpdated,
}: MarketInsightsProps) {
  const HIDDEN_BULLET_TITLES = ['Worst Sector', 'Volatility Signal', 'Sector Rotation', 'Severe Stock Loss']

  const renderBulletList = (bullets: MarketTrendsBullet[], loading: boolean, error?: string) => {
    bullets = bullets
      .filter((bullet) => !HIDDEN_BULLET_TITLES.includes(bullet.title))
      .slice(0, 3)

    if (loading) {
      return (
        <div aria-label="Loading key drivers" className="space-y-3 py-1">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
              style={{ width: `${92 - index * 12}%` }}
            />
          ))}
        </div>
      )
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
        <div className="py-2 text-sm text-gray-500 dark:text-gray-400">
          No key drivers are available yet.
        </div>
      )
    }

    return (
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {bullets.map((bullet) => (
          <div
            key={`${bullet.title}-${bullet.description}`}
            className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
          >
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {bullet.title}
            </span>
            <span className="text-sm leading-5 text-gray-600 dark:text-gray-400">
              {bullet.description}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const refreshing = responsesLoading || marketSummaryLoading
  const refreshAll = () => {
    onRefreshResponses?.()
    onRefreshSummary?.()
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
              What matters now
            </p>
            {marketSummaryLoading && !marketTakeaway ? (
              <div className="mt-2 h-5 w-full max-w-3xl animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : (
              <h2 className="mt-1.5 max-w-4xl text-base font-medium leading-6 text-gray-950 dark:text-white">
                {marketTakeaway || 'Market conditions are updating.'}
              </h2>
            )}
          </div>
          {(onRefreshResponses || onRefreshSummary) ? (
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="shrink-0 text-xs font-medium text-gray-500 transition-colors hover:text-sage-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-sage-300"
            >
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          ) : null}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            Key drivers
          </p>
          {renderBulletList(responsesApiBullets, responsesLoading, responsesError)}
        </div>

        {(marketSummary || marketSummaryLoading) ? (
          <details className="group mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              <span>Read full context</span>
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-180"
              >
                ↓
              </span>
            </summary>
            <div className="max-w-5xl pb-1 pt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {marketSummaryLoading ? (
                <div className="space-y-2" aria-label="Loading full market context">
                  <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                </div>
              ) : marketSummary ? (
                <div className="whitespace-pre-wrap">{renderFormattedSummary(marketSummary)}</div>
              ) : null}
              {summaryLastUpdated ? (
                <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500">
                  Updated after the latest manual refresh.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}
