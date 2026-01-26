'use client'

import { useState, useEffect } from 'react'
import type { MarketTrendsBullet } from '@/app/actions/market-trends-responses'
import { TRENDS_LOADING_STEPS, TRENDS_LOADING_MESSAGES, type TrendsLoadingStep } from '@/lib/loading-steps'

type ApproachType = 'responses-api' | 'agents-sdk' | 'side-by-side'

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
              <span className="text-green-500 w-3 text-center">✓</span>
            ) : isCurrent ? (
              <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600" />
            )}
            <span className={`${
              isCompleted ? 'text-green-600 dark:text-green-400' :
              isCurrent ? 'text-blue-600 dark:text-blue-400 font-medium' :
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
  agentsSdkBullets?: MarketTrendsBullet[]
  responsesLoading?: boolean
  agentsLoading?: boolean
  responsesError?: string
  agentsError?: string
  onRefreshResponses?: () => void
  onRefreshAgents?: () => void
  responsesGeneratedAt?: string
  agentsGeneratedAt?: string
}

export default function MarketInsights({
  responsesApiBullets = [],
  agentsSdkBullets = [],
  responsesLoading = false,
  agentsLoading = false,
  responsesError,
  agentsError,
  onRefreshResponses,
  onRefreshAgents,
  responsesGeneratedAt,
  agentsGeneratedAt,
}: MarketInsightsProps) {
  const [approach, setApproach] = useState<ApproachType>('responses-api')

  const renderBulletList = (bullets: MarketTrendsBullet[], loading: boolean, error?: string, generatedAt?: string) => {
    if (loading) {
      return <TrendsLoadingSteps loading={loading} />
    }

    if (error) {
      return (
        <div className="text-red-500 text-sm py-4">
          Error: {error}
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
            <span className="text-sm flex-shrink-0">{bullet.emoji}</span>
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
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ height: '400px' }}>
      {/* Header with toggle */}
      <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Market Trends</h2>
          <div className="flex items-center gap-2">
            {/* Approach Toggle */}
            <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => setApproach('responses-api')}
                className={`px-1.5 py-0.5 text-[8px] ${
                  approach === 'responses-api'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Responses
              </button>
              <button
                onClick={() => setApproach('agents-sdk')}
                className={`px-1.5 py-0.5 text-[8px] border-l border-gray-300 dark:border-gray-600 ${
                  approach === 'agents-sdk'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Agents
              </button>
              <button
                onClick={() => setApproach('side-by-side')}
                className={`px-1.5 py-0.5 text-[8px] border-l border-gray-300 dark:border-gray-600 ${
                  approach === 'side-by-side'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Compare
              </button>
            </div>
            {/* Refresh buttons */}
            {approach !== 'side-by-side' && (
              <button
                onClick={approach === 'responses-api' ? onRefreshResponses : onRefreshAgents}
                disabled={approach === 'responses-api' ? responsesLoading : agentsLoading}
                className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white"
              >
                {(approach === 'responses-api' ? responsesLoading : agentsLoading) ? '...' : 'Refresh'}
              </button>
            )}
            {approach === 'side-by-side' && (
              <button
                onClick={() => {
                  onRefreshResponses?.()
                  onRefreshAgents?.()
                }}
                disabled={responsesLoading || agentsLoading}
                className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white"
              >
                {responsesLoading || agentsLoading ? '...' : 'Both'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-2 text-sm text-gray-700 dark:text-gray-300 overflow-y-auto" style={{ height: 'calc(100% - 29px)' }}>
        {approach === 'side-by-side' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-semibold text-blue-500 mb-1.5 pb-1 border-b border-gray-200 dark:border-gray-700">
                Responses API
              </div>
              {renderBulletList(responsesApiBullets, responsesLoading, responsesError, responsesGeneratedAt)}
            </div>
            <div>
              <div className="text-[9px] font-semibold text-green-500 mb-1.5 pb-1 border-b border-gray-200 dark:border-gray-700">
                Agents SDK
              </div>
              {renderBulletList(agentsSdkBullets, agentsLoading, agentsError, agentsGeneratedAt)}
            </div>
          </div>
        ) : approach === 'responses-api' ? (
          renderBulletList(responsesApiBullets, responsesLoading, responsesError, responsesGeneratedAt)
        ) : (
          renderBulletList(agentsSdkBullets, agentsLoading, agentsError, agentsGeneratedAt)
        )}
      </div>
    </div>
  )
}
