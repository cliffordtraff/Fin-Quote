'use client'

import { useEffect, useState } from 'react'
import { getCostStats, type CostStats } from '@/app/actions/get-costs'

export default function CostsPage() {
  const [stats, setStats] = useState<CostStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d')

  useEffect(() => {
    loadStats()
  }, [dateRange])

  async function loadStats() {
    setLoading(true)

    const now = new Date()
    let startDate: string | undefined

    if (dateRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    } else if (dateRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    const result = await getCostStats({ startDate })
    if (result.data) {
      setStats(result.data)
    }
    setLoading(false)
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(amount)
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-gray-600">Loading costs...</div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12 text-red-600">Error loading cost data</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">API Cost Dashboard</h1>
              <p className="text-gray-600">Monitor OpenAI API usage and costs</p>
            </div>
            <div className="flex gap-4">
              <a
                href="/admin/validation"
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors"
              >
                Validation Dashboard
              </a>
              <a
                href="/admin/review"
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium transition-colors"
              >
                Review Dashboard
              </a>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex gap-2 mb-6">
          {(['7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                dateRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Cost</div>
            <div className="text-3xl font-bold text-blue-600">{formatCurrency(stats.total_cost_usd)}</div>
            <div className="text-xs text-gray-500 mt-1">{stats.total_queries} queries</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">LLM Cost</div>
            <div className="text-3xl font-bold text-green-600">{formatCurrency(stats.llm_cost_usd)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {formatNumber(stats.total_input_tokens + stats.total_output_tokens)} tokens
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Embedding Cost</div>
            <div className="text-3xl font-bold text-purple-600">{formatCurrency(stats.embedding_cost_usd)}</div>
            <div className="text-xs text-gray-500 mt-1">{formatNumber(stats.total_embedding_tokens)} tokens</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Avg Cost/Query</div>
            <div className="text-3xl font-bold text-orange-600">{formatCurrency(stats.avg_cost_per_query)}</div>
            <div className="text-xs text-gray-500 mt-1">per query</div>
          </div>
        </div>

        {/* Token Breakdown */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Token Usage Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Input Tokens (Prompts)</div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.total_input_tokens)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(stats.total_input_tokens * 0.15 / 1_000_000)} @ $0.15/1M
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Output Tokens (Completions)</div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.total_output_tokens)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(stats.total_output_tokens * 0.6 / 1_000_000)} @ $0.60/1M
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Embedding Tokens</div>
              <div className="text-2xl font-bold text-gray-900">{formatNumber(stats.total_embedding_tokens)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(stats.total_embedding_tokens * 0.02 / 1_000_000)} @ $0.02/1M
              </div>
            </div>
          </div>
        </div>

        {/* Cost by Tool */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Cost by Tool</h2>
          <div className="space-y-4">
            {stats.cost_by_tool.map((item) => (
              <div key={item.tool} className="border-b pb-4 last:border-b-0">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-900">{item.tool}</div>
                    <div className="text-sm text-gray-500">{item.queries} queries</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{formatCurrency(item.cost)}</div>
                    <div className="text-sm text-gray-500">
                      {formatCurrency(item.cost / item.queries)}/query
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cost by Date */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Daily Cost Trend</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Queries
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg/Query
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.cost_by_date.map((item) => (
                  <tr key={item.date} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(item.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.queries}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(item.cost)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {formatCurrency(item.cost / item.queries)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing Reference */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">OpenAI Pricing Reference</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <div>• GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens</div>
            <div>• text-embedding-3-small: $0.020 per 1M tokens</div>
          </div>
        </div>
      </div>
    </div>
  )
}
