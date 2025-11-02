'use client'

import { useEffect, useState } from 'react'
import {
  getQueriesForReview,
  markQueryIncorrect,
  markQueryCorrect,
  getErrorCategoryStats,
  type QueryLogWithDetails,
  type ErrorCategory,
} from '@/app/actions/review-query'

const ERROR_CATEGORIES: { value: ErrorCategory; label: string }[] = [
  { value: 'wrong_tool', label: 'Wrong Tool Selected' },
  { value: 'wrong_arguments', label: 'Wrong Arguments' },
  { value: 'wrong_units', label: 'Wrong Units/Formatting' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'correct_data_wrong_interpretation', label: 'Correct Data, Wrong Interpretation' },
  { value: 'missing_data', label: 'Missing Data' },
  { value: 'other', label: 'Other' },
]

export default function ReviewPage() {
  const [queries, setQueries] = useState<QueryLogWithDetails[]>([])
  const [filter, setFilter] = useState<'thumbs_down' | 'no_feedback' | 'unreviewed' | 'all'>('unreviewed')
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Array<{ error_category: string; count: number }>>([])
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null)
  const [reviewingQuery, setReviewingQuery] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory>('wrong_tool')
  const [reviewerNotes, setReviewerNotes] = useState('')

  useEffect(() => {
    loadQueries()
    loadStats()
  }, [filter])

  async function loadQueries() {
    setLoading(true)
    const result = await getQueriesForReview({ filter, limit: 50 })
    if (result.data) {
      setQueries(result.data)
      setTotal(result.total)
    }
    setLoading(false)
  }

  async function loadStats() {
    const result = await getErrorCategoryStats()
    if (result.data) {
      setStats(result.data)
    }
  }

  async function handleMarkIncorrect(queryId: string) {
    const result = await markQueryIncorrect({
      queryLogId: queryId,
      errorCategory: selectedCategory,
      reviewerNotes: reviewerNotes,
    })

    if (result.success) {
      // Remove from list or reload
      setQueries(queries.filter((q) => q.id !== queryId))
      setReviewingQuery(null)
      setReviewerNotes('')
      loadStats()
    } else {
      alert('Error: ' + result.error)
    }
  }

  async function handleMarkCorrect(queryId: string) {
    const result = await markQueryCorrect({
      queryLogId: queryId,
      reviewerNotes: reviewerNotes,
    })

    if (result.success) {
      // Remove from list or reload
      setQueries(queries.filter((q) => q.id !== queryId))
      setReviewingQuery(null)
      setReviewerNotes('')
    } else {
      alert('Error: ' + result.error)
    }
  }

  function getFeedbackBadge(feedback: string | null) {
    if (feedback === 'thumbs_up') {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">👍 Thumbs Up</span>
    }
    if (feedback === 'thumbs_down') {
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">👎 Thumbs Down</span>
    }
    return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">No Feedback</span>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Query Review Dashboard</h1>
          <p className="text-gray-600">Review and categorize query failures for active learning</p>
        </div>

        {/* Stats Summary */}
        {stats.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Error Category Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat) => (
                <div key={stat.error_category} className="border rounded p-3">
                  <div className="text-2xl font-bold text-blue-600">{stat.count}</div>
                  <div className="text-sm text-gray-600">{stat.error_category.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['unreviewed', 'thumbs_down', 'no_feedback', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              {f.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} ({total})
            </button>
          ))}
        </div>

        {/* Query List */}
        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading queries...</div>
        ) : queries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 text-lg">No queries to review! 🎉</p>
            <p className="text-gray-500 text-sm mt-2">Try changing the filter above</p>
          </div>
        ) : (
          <div className="space-y-4">
            {queries.map((query) => (
              <div key={query.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Query Header */}
                <div className="p-4 border-b">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{query.user_question}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span>{new Date(query.created_at).toLocaleString()}</span>
                        <span>•</span>
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{query.tool_selected}</span>
                        {getFeedbackBadge(query.user_feedback)}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedQuery(expandedQuery === query.id ? null : query.id)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      {expandedQuery === query.id ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedQuery === query.id && (
                  <div className="p-4 bg-gray-50 border-b space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Tool Arguments:</h4>
                      <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                        {JSON.stringify(query.tool_args, null, 2)}
                      </pre>
                    </div>

                    {query.tool_error && (
                      <div>
                        <h4 className="text-sm font-semibold text-red-700 mb-1">Tool Error:</h4>
                        <div className="text-sm bg-red-50 text-red-900 p-2 rounded border border-red-200">
                          {query.tool_error}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Answer Generated:</h4>
                      <div className="text-sm bg-white p-3 rounded border">{query.answer_generated}</div>
                    </div>

                    {query.data_returned && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                          Data Returned ({query.data_row_count} rows):
                        </h4>
                        <pre className="text-xs bg-white p-2 rounded border overflow-x-auto max-h-40 overflow-y-auto">
                          {JSON.stringify(query.data_returned, null, 2)}
                        </pre>
                      </div>
                    )}

                    {query.user_feedback_comment && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">User Comment:</h4>
                        <div className="text-sm bg-blue-50 text-blue-900 p-2 rounded border border-blue-200">
                          {query.user_feedback_comment}
                        </div>
                      </div>
                    )}

                    {query.error_category && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Previous Review:</h4>
                        <div className="text-sm bg-yellow-50 p-2 rounded border border-yellow-200">
                          <div className="font-medium">Category: {query.error_category}</div>
                          {query.reviewer_notes && <div className="mt-1">Notes: {query.reviewer_notes}</div>}
                          <div className="text-xs text-gray-600 mt-1">
                            Reviewed: {query.reviewed_at ? new Date(query.reviewed_at).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Review Actions */}
                <div className="p-4 bg-white">
                  {reviewingQuery === query.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Error Category:
                        </label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => setSelectedCategory(e.target.value as ErrorCategory)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ERROR_CATEGORIES.map((cat) => (
                            <option key={cat.value} value={cat.value}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Reviewer Notes (optional):
                        </label>
                        <textarea
                          value={reviewerNotes}
                          onChange={(e) => setReviewerNotes(e.target.value)}
                          placeholder="Why did this fail? What pattern do you see?"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMarkIncorrect(query.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
                        >
                          Mark as Incorrect
                        </button>
                        <button
                          onClick={() => handleMarkCorrect(query.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                        >
                          Mark as Correct
                        </button>
                        <button
                          onClick={() => {
                            setReviewingQuery(null)
                            setReviewerNotes('')
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingQuery(query.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      Review This Query
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
