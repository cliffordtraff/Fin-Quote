'use client'

import { useState, useEffect } from 'react'
import { getDexterMarketSummary, DexterMarketSummaryResult, MarketDataContext } from '@/app/actions/dexter-market-summary'

interface DexterMarketSummaryProps {
  initialSummary?: DexterMarketSummaryResult | null
  marketData?: MarketDataContext
}

export default function DexterMarketSummary({ initialSummary, marketData }: DexterMarketSummaryProps) {
  const [result, setResult] = useState<DexterMarketSummaryResult | null>(initialSummary || null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialSummary ? new Date() : null)

  const fetchSummary = async () => {
    setIsLoading(true)
    try {
      const summary = await getDexterMarketSummary(marketData)
      setResult(summary)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to fetch Dexter summary:', error)
      setResult({
        summary: '',
        toolsUsed: [],
        iterations: 0,
        error: 'Failed to fetch market summary',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Don't auto-fetch - let user click "Refresh" to trigger Dexter

  return (
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Dexter Market Analysis
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              AI Agent
            </span>
          </div>
          <button
            onClick={fetchSummary}
            disabled={isLoading}
            className="text-xs px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Researching...' : 'Refresh'}
          </button>
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Dexter is researching the market...
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              This may take 30-60 seconds as Dexter searches news and analyzes market data.
            </p>
            {/* Skeleton */}
            <div className="space-y-2 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-11/12" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10/12" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-9/12" />
            </div>
          </div>
        ) : result?.error ? (
          <div className="text-red-600 dark:text-red-400">
            <p className="text-sm font-medium">Error</p>
            <p className="text-xs mt-1">{result.error}</p>
          </div>
        ) : result?.summary ? (
          <div className="space-y-4">
            {/* Summary text */}
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {result.summary}
            </div>

            {/* Metadata footer */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                {result.toolsUsed.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span>Tools used:</span>
                    {result.toolsUsed.map((tool) => (
                      <span
                        key={tool}
                        className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {tool}
                      </span>
                    ))}
                  </span>
                )}
                {result.iterations > 0 && (
                  <span className="text-gray-400 dark:text-gray-600">
                    | {result.iterations} iteration{result.iterations !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No market summary available.
          </p>
        )}
      </div>
    </div>
  )
}
