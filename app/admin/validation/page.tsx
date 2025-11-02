'use client'

import { useEffect, useState } from 'react'
import {
  getValidationStats,
  getQueriesForValidationReview,
  type ValidationStats,
  type ValidationFailure,
} from '@/app/actions/get-validation-stats'

export default function ValidationDashboard() {
  const [stats, setStats] = useState<ValidationStats | null>(null)
  const [queries, setQueries] = useState<ValidationFailure[]>([])
  const [filter, setFilter] = useState<'failed' | 'regenerated' | 'critical' | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [daysFilter, setDaysFilter] = useState<7 | 30>(7)
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [daysFilter, filter])

  async function loadData() {
    setLoading(true)

    // Load stats
    const statsResult = await getValidationStats({ days: daysFilter })
    if (statsResult.data) {
      setStats(statsResult.data)
    }

    // Load queries
    const queriesResult = await getQueriesForValidationReview({ filter, limit: 50 })
    if (queriesResult.data) {
      setQueries(queriesResult.data)
    }

    setLoading(false)
  }

  function getSeverityBadge(severity: string) {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-blue-100 text-blue-800 border-blue-300',
      none: 'bg-green-100 text-green-800 border-green-300',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded border ${colors[severity] || 'bg-gray-100 text-gray-800'}`}>
        {severity.toUpperCase()}
      </span>
    )
  }

  function getValidationStatusBadge(status: string) {
    if (status === 'pass') {
      return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">✓ Pass</span>
    }
    if (status === 'fail') {
      return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">✗ Fail</span>
    }
    return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">⊘ Skip</span>
  }

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-gray-600">Loading validation dashboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Validation Dashboard</h1>
              <p className="text-gray-600 mb-3">
                Phase 1 & 3: Answer validation and auto-correction metrics
              </p>
              <a
                href="/admin/review"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                ← Back to Query Review Dashboard
              </a>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDaysFilter(7)}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  daysFilter === 7
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setDaysFilter(30)}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  daysFilter === 30
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                }`}
              >
                Last 30 Days
              </button>
            </div>
          </div>
        </div>

        {/* Overall Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-2">Total Validated</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.overall.validated_queries}
              </div>
              <div className="text-xs text-gray-500 mt-1">queries with validation</div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-2">Pass Rate</div>
              <div className="text-3xl font-bold text-green-600">
                {stats.overall.pass_rate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.overall.passed} passed / {stats.overall.failed} failed
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-2">Regenerations</div>
              <div className="text-3xl font-bold text-blue-600">
                {stats.regeneration.total_triggered}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.regeneration.success_rate.toFixed(1)}% success rate
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-2">Auto-Corrected</div>
              <div className="text-3xl font-bold text-purple-600">
                {stats.regeneration.succeeded}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                fixed automatically (Phase 3)
              </div>
            </div>
          </div>
        )}

        {/* Validator Breakdown */}
        {stats && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Validator Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Number Validator */}
              <div className="border rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Number Validator</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pass:</span>
                    <span className="font-semibold text-green-600">
                      {stats.by_validator.number.pass}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Fail:</span>
                    <span className="font-semibold text-red-600">
                      {stats.by_validator.number.fail}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Skip:</span>
                    <span className="font-semibold text-gray-500">
                      {stats.by_validator.number.skip}
                    </span>
                  </div>
                </div>
              </div>

              {/* Year Validator */}
              <div className="border rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Year Validator</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pass:</span>
                    <span className="font-semibold text-green-600">
                      {stats.by_validator.year.pass}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Fail:</span>
                    <span className="font-semibold text-red-600">
                      {stats.by_validator.year.fail}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Skip:</span>
                    <span className="font-semibold text-gray-500">
                      {stats.by_validator.year.skip}
                    </span>
                  </div>
                </div>
              </div>

              {/* Filing Validator */}
              <div className="border rounded p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Filing Validator</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pass:</span>
                    <span className="font-semibold text-green-600">
                      {stats.by_validator.filing.pass}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Fail:</span>
                    <span className="font-semibold text-red-600">
                      {stats.by_validator.filing.fail}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Skip:</span>
                    <span className="font-semibold text-gray-500">
                      {stats.by_validator.filing.skip}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Severity Breakdown */}
        {stats && stats.by_severity.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Severity Distribution</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {stats.by_severity.map((item) => (
                <div key={item.severity} className="border rounded p-3">
                  <div className="text-2xl font-bold text-gray-900">{item.count}</div>
                  <div className="text-sm text-gray-600 capitalize">{item.severity}</div>
                  <div className="text-xs text-gray-500">{item.percentage.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily Trend Chart */}
        {stats && stats.daily_trend.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Daily Validation Pass Rate</h2>
            <div className="space-y-2">
              {stats.daily_trend.map((day) => (
                <div key={day.date} className="flex items-center gap-4">
                  <div className="text-sm text-gray-600 w-24">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                    <div
                      className="bg-green-500 rounded-full h-6 flex items-center justify-center text-xs font-semibold text-white"
                      style={{ width: `${day.pass_rate}%` }}
                    >
                      {day.pass_rate > 10 && `${day.pass_rate.toFixed(0)}%`}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 w-32">
                    {day.passed}/{day.total} queries
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'failed', 'regenerated', 'critical'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({queries.length})
            </button>
          ))}
        </div>

        {/* Query List */}
        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading queries...</div>
        ) : queries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 text-lg">No queries found! 🎉</p>
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {query.user_question}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span>{new Date(query.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</span>
                        <span>•</span>
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {query.tool_selected}
                        </span>
                        {getSeverityBadge(query.overall_severity)}
                        {query.regeneration_attempted && (
                          <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                            🔄 Regenerated
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setExpandedQuery(expandedQuery === query.id ? null : query.id)
                      }
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      {expandedQuery === query.id ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedQuery === query.id && (
                  <div className="p-4 bg-gray-50 border-b space-y-4">
                    {/* Answer */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">
                        Answer Generated:
                      </h4>
                      <div className="text-sm bg-white p-3 rounded border">
                        {query.answer_generated}
                      </div>
                    </div>

                    {/* Validation Results */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Validation Results:
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded border">
                          <div className="text-xs text-gray-600 mb-1">Number Validation</div>
                          {getValidationStatusBadge(
                            query.validation_results?.number_validation?.status || 'skip'
                          )}
                          {query.validation_results?.number_validation?.details && (
                            <div className="text-xs text-gray-600 mt-1">
                              {query.validation_results.number_validation.details}
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded border">
                          <div className="text-xs text-gray-600 mb-1">Year Validation</div>
                          {getValidationStatusBadge(
                            query.validation_results?.year_validation?.status || 'skip'
                          )}
                          {query.validation_results?.year_validation?.details && (
                            <div className="text-xs text-gray-600 mt-1">
                              {query.validation_results.year_validation.details}
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded border">
                          <div className="text-xs text-gray-600 mb-1">Filing Validation</div>
                          {getValidationStatusBadge(
                            query.validation_results?.filing_validation?.status || 'skip'
                          )}
                          {query.validation_results?.filing_validation?.details && (
                            <div className="text-xs text-gray-600 mt-1">
                              {query.validation_results.filing_validation.details}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Regeneration Details */}
                    {query.regeneration_attempted && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Regeneration (Phase 3):
                        </h4>
                        <div className="bg-white p-3 rounded border">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-600">Status:</span>{' '}
                              <span
                                className={
                                  query.regeneration_succeeded
                                    ? 'text-green-600 font-semibold'
                                    : 'text-red-600 font-semibold'
                                }
                              >
                                {query.regeneration_succeeded ? '✓ Succeeded' : '✗ Failed'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Reason:</span>{' '}
                              <span className="text-gray-900">
                                {query.validation_results?.regeneration?.reason ||
                                  'Not specified'}
                              </span>
                            </div>
                          </div>
                          {query.validation_results?.regeneration?.first_attempt_answer && (
                            <div className="mt-2 pt-2 border-t">
                              <div className="text-xs text-gray-600 mb-1">First Attempt:</div>
                              <div className="text-xs text-gray-900 italic">
                                {query.validation_results.regeneration.first_attempt_answer.substring(
                                  0,
                                  200
                                )}
                                ...
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tool Arguments */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">
                        Tool Arguments:
                      </h4>
                      <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                        {JSON.stringify(query.tool_args, null, 2)}
                      </pre>
                    </div>

                    {/* User Feedback */}
                    {query.user_feedback && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                          User Feedback:
                        </h4>
                        <div
                          className={`text-sm p-2 rounded border ${
                            query.user_feedback === 'thumbs_up'
                              ? 'bg-green-50 text-green-900 border-green-200'
                              : 'bg-red-50 text-red-900 border-red-200'
                          }`}
                        >
                          {query.user_feedback === 'thumbs_up' ? '👍 Thumbs Up' : '👎 Thumbs Down'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
