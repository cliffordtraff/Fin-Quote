/**
 * Earnings Impact Meter Component
 *
 * Visual bar showing earnings impact confidence with breakdown
 */

import React, { useState } from 'react'
import { EarningsContext } from '@watchlist/types/earnings'
import { earningsContextCalculator } from '@watchlist/lib/earnings/earnings-context'

interface ImpactMeterProps {
  confidence: number
  breakdown?: {
    temporal: number
    volume: number
    news: number
    analyst: number
    gap: number
    negative: number
  }
  showBreakdown?: boolean
}

export const ImpactMeter: React.FC<ImpactMeterProps> = ({
  confidence,
  breakdown,
  showBreakdown = true
}) => {
  const [showDetails, setShowDetails] = useState(false)

  // Determine color based on confidence level
  const getColor = (conf: number) => {
    if (conf >= 90) return 'bg-red-500'      // Very high - red (hot)
    if (conf >= 70) return 'bg-orange-500'   // High - orange
    if (conf >= 50) return 'bg-yellow-500'   // Moderate - yellow
    if (conf >= 30) return 'bg-blue-500'     // Low - blue
    return 'bg-gray-400'                      // Very low - gray
  }

  const getLabel = (conf: number) => {
    return earningsContextCalculator.getConfidenceLabel(conf)
  }

  const color = getColor(confidence)
  const label = getLabel(confidence)
  const percentage = Math.min(100, Math.max(0, confidence))

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Earnings Impact
        </span>
        <span
          className="text-xs font-semibold text-gray-900 dark:text-gray-100"
          title={label}
        >
          {confidence}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={confidence}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Earnings impact confidence: ${confidence}%`}
        />
        {/* Threshold markers */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 border-r border-white/30" />
          <div className="flex-1 border-r border-white/30" />
          <div className="flex-1 border-r border-white/30" />
          <div className="flex-1" />
        </div>
      </div>

      {/* Label */}
      <div className="text-xs text-gray-600 dark:text-gray-400 italic">
        {label}
      </div>

      {/* Breakdown (optional) */}
      {showBreakdown && breakdown && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <span>Based on:</span>
            <svg
              className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDetails && (
            <div className="mt-2 space-y-1.5">
              {breakdown.temporal > 0 && (
                <BreakdownItem
                  icon="📅"
                  label="Temporal proximity"
                  value={breakdown.temporal}
                />
              )}
              {breakdown.volume > 0 && (
                <BreakdownItem
                  icon="📊"
                  label="Volume anomaly"
                  value={breakdown.volume}
                />
              )}
              {breakdown.news > 0 && (
                <BreakdownItem
                  icon="📰"
                  label="News mentions"
                  value={breakdown.news}
                />
              )}
              {breakdown.analyst > 0 && (
                <BreakdownItem
                  icon="👔"
                  label="Analyst activity"
                  value={breakdown.analyst}
                />
              )}
              {breakdown.gap > 0 && (
                <BreakdownItem
                  icon="📈"
                  label="Gap at open"
                  value={breakdown.gap}
                />
              )}
              {breakdown.negative < 0 && (
                <BreakdownItem
                  icon="⚠️"
                  label="Conflicting signals"
                  value={breakdown.negative}
                  isNegative
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Breakdown Item
 */
const BreakdownItem: React.FC<{
  icon: string
  label: string
  value: number
  isNegative?: boolean
}> = ({ icon, label, value, isNegative = false }) => {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true">{icon}</span>
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <span className={`font-medium ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  )
}

export default ImpactMeter
