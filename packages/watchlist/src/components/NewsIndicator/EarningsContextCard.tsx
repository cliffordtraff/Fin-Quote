/**
 * Earnings Context Card Component
 *
 * Expandable card showing detailed earnings information
 */

import React, { useState } from 'react'
import { EarningsContext, EarningsData } from '@watchlist/types/earnings'
import { beatQualityScorer } from '@watchlist/lib/earnings/beat-quality'

interface EarningsContextCardProps {
  context: EarningsContext
  expanded?: boolean
}

export const EarningsContextCard: React.FC<EarningsContextCardProps> = ({
  context,
  expanded: defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { lastEarnings, nextEarnings } = context

  // Don't show if no earnings data
  if (!lastEarnings && !nextEarnings) {
    return null
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="earnings-details"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">📊</span>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            Earnings Details
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div id="earnings-details" className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {/* Last Earnings */}
          {lastEarnings && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Last Report: {lastEarnings.date}
                {lastEarnings.time && (
                  <span className="ml-2 text-gray-500 dark:text-gray-400">
                    ({lastEarnings.time.toUpperCase()})
                  </span>
                )}
              </h4>

              {/* EPS */}
              {lastEarnings.epsEstimate !== null && (
                <div className="space-y-1 mb-2">
                  <EarningsMetric
                    label="EPS"
                    actual={lastEarnings.epsActual}
                    estimate={lastEarnings.epsEstimate}
                    formatter={(v) => `$${v.toFixed(2)}`}
                  />
                </div>
              )}

              {/* Revenue */}
              {lastEarnings.revenueEstimate !== null && (
                <div className="space-y-1 mb-2">
                  <EarningsMetric
                    label="Revenue"
                    actual={lastEarnings.revenueActual}
                    estimate={lastEarnings.revenueEstimate}
                    formatter={formatRevenue}
                  />
                </div>
              )}

              {/* Beat Quality */}
              {(lastEarnings.epsActual !== null || lastEarnings.revenueActual !== null) && (
                <BeatQualityDisplay earnings={lastEarnings} />
              )}
            </div>
          )}

          {/* Next Earnings */}
          {nextEarnings && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Next Report: {nextEarnings.date}
                {nextEarnings.time && (
                  <span className="ml-2 text-gray-500 dark:text-gray-400">
                    ({nextEarnings.time.toUpperCase()})
                  </span>
                )}
              </h4>

              {nextEarnings.epsEstimate !== null && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  EPS Estimate: ${nextEarnings.epsEstimate.toFixed(2)}
                </div>
              )}

              {nextEarnings.revenueEstimate !== null && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Revenue Estimate: {formatRevenue(nextEarnings.revenueEstimate)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Earnings Metric Row (Actual vs Estimate)
 */
const EarningsMetric: React.FC<{
  label: string
  actual: number | null
  estimate: number | null
  formatter: (v: number) => string
}> = ({ label, actual, estimate, formatter }) => {
  if (estimate === null) return null

  const hasActual = actual !== null
  const diff = hasActual ? actual - estimate : 0
  const diffPercent = hasActual && estimate !== 0 ? ((diff / Math.abs(estimate)) * 100) : 0
  const isBeat = diff > 0
  const isMiss = diff < 0

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between">
        <span className="text-gray-600 dark:text-gray-400">{label}:</span>
        <div className="flex items-center gap-2">
          {hasActual ? (
            <>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatter(actual)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">vs</span>
              <span className="text-gray-600 dark:text-gray-400">
                {formatter(estimate)}
              </span>
              <span className={`font-medium ${isBeat ? 'text-green-600 dark:text-green-400' : isMiss ? 'text-red-600 dark:text-red-400' : 'text-gray-600'}`}>
                {isBeat ? '✅' : isMiss ? '❌' : '➖'}
              </span>
            </>
          ) : (
            <span className="text-gray-600 dark:text-gray-400">
              Est: {formatter(estimate)}
            </span>
          )}
        </div>
      </div>

      {hasActual && Math.abs(diffPercent) > 0.1 && (
        <div className="text-right mt-0.5">
          <span className={`text-xs ${isBeat ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {diff > 0 ? '+' : ''}{formatter(diff)} ({diff > 0 ? '+' : ''}{diffPercent.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Beat Quality Display with Star Rating
 */
const BeatQualityDisplay: React.FC<{ earnings: EarningsData }> = ({ earnings }) => {
  const beatQuality = beatQualityScorer.calculateBeatQuality(earnings)
  const stars = beatQualityScorer.getStarRating(beatQuality.overallScore)

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600 dark:text-gray-400">Beat Quality:</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
            {beatQuality.overallScore}/100
          </span>
          <div className="flex gap-0.5" aria-label={`${stars} out of 5 stars`}>
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className={i < stars ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}
                aria-hidden="true"
              >
                ⭐
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Format revenue (billions/millions)
 */
function formatRevenue(value: number | null): string {
  if (value === null) return 'N/A'

  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`
  }
  return `$${value.toFixed(2)}`
}

export default EarningsContextCard
