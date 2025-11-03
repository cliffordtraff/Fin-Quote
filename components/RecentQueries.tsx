'use client'

import { useState, useEffect } from 'react'
import { getRecentQueries, clearQueryHistory, type RecentQuery } from '@/app/actions/get-recent-queries'

type RecentQueriesProps = {
  userId?: string
  sessionId?: string
  onQueryClick: (question: string) => void
  refreshTrigger?: number // Used to trigger refresh after new query
}

export default function RecentQueries({ userId, sessionId, onQueryClick, refreshTrigger }: RecentQueriesProps) {
  const [queries, setQueries] = useState<RecentQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const loadQueries = async () => {
    if (!userId && !sessionId) return

    setLoading(true)
    const data = await getRecentQueries({ userId, sessionId })
    setQueries(data)
    setLoading(false)
  }

  // Load queries on mount and when userId, sessionId, or refreshTrigger changes
  useEffect(() => {
    loadQueries()
  }, [userId, sessionId, refreshTrigger])

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear your query history?')) return

    setClearing(true)
    const result = await clearQueryHistory({ userId, sessionId })

    if (result.success) {
      setQueries([])
    } else {
      alert('Failed to clear history. Please try again.')
    }

    setClearing(false)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Recent Queries</h2>
        {queries.length > 0 && (
          <button
            onClick={handleClearHistory}
            disabled={clearing}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
            title="Clear history"
          >
            {clearing ? 'Clearing...' : 'Clear'}
          </button>
        )}
      </div>

      {/* Query List */}
      <div className="flex-1 overflow-y-auto">
        {queries.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-base text-gray-500">No recent queries</p>
            <p className="text-sm text-gray-400 mt-1">Your questions will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {queries.map((query) => (
              <button
                key={query.id}
                onClick={() => onQueryClick(query.question)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base text-gray-900 font-medium line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {truncateText(query.question, 100)}
                  </p>
                  <span className="text-sm text-gray-400 whitespace-nowrap flex-shrink-0">
                    {formatTime(query.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {queries.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500 text-center">
            Click any question to ask it again
          </p>
        </div>
      )}
    </div>
  )
}
