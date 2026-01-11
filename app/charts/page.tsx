'use client'

import { useState, useEffect, useCallback } from 'react'
import Navigation from '@/components/Navigation'
import MetricSelector from '@/components/MetricSelector'
import MultiMetricChart from '@/components/MultiMetricChart'
import { getMultipleMetrics, getAvailableMetrics, type MetricData, type MetricId } from '@/app/actions/chart-metrics'

export default function ChartsPage() {
  const [availableMetrics, setAvailableMetrics] = useState<{ id: MetricId; label: string; unit: string }[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<MetricId[]>(['revenue'])
  const [metricsData, setMetricsData] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yearRange, setYearRange] = useState(10)

  // Load available metrics on mount
  useEffect(() => {
    async function loadMetrics() {
      const metrics = await getAvailableMetrics()
      setAvailableMetrics(metrics)
    }
    loadMetrics()
  }, [])

  // Fetch data when selected metrics or year range changes
  const fetchData = useCallback(async () => {
    if (selectedMetrics.length === 0) {
      setMetricsData([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await getMultipleMetrics({
        metrics: selectedMetrics,
        limit: yearRange,
      })

      if (fetchError) {
        setError(fetchError)
        setMetricsData([])
      } else if (data) {
        setMetricsData(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setMetricsData([])
    } finally {
      setLoading(false)
    }
  }, [selectedMetrics, yearRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metricId as MetricId)) {
        // Remove metric (but keep at least one)
        if (prev.length === 1) return prev
        return prev.filter((m) => m !== metricId)
      } else {
        // Add metric (max 4 for readability)
        if (prev.length >= 4) {
          // Remove oldest and add new
          return [...prev.slice(1), metricId as MetricId]
        }
        return [...prev, metricId as MetricId]
      }
    })
  }

  const handleClearAll = () => {
    setSelectedMetrics(['revenue'])
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <Navigation />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            AAPL Financial Charts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Select metrics to visualize Apple&apos;s financial performance over time
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-[rgb(45,45,45)] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Metric Selector */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Select Metrics (up to 4)
              </label>
              <MetricSelector
                metrics={availableMetrics}
                selectedMetrics={selectedMetrics}
                onToggle={handleMetricToggle}
                onClear={handleClearAll}
              />
            </div>

            {/* Year Range Selector */}
            <div className="lg:w-48">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Time Range
              </label>
              <select
                value={yearRange}
                onChange={(e) => setYearRange(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[rgb(55,55,55)] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={5}>5 Years</option>
                <option value={10}>10 Years</option>
                <option value={15}>15 Years</option>
                <option value={20}>20 Years</option>
              </select>
            </div>
          </div>

          {/* Selected metrics pills */}
          {selectedMetrics.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-2">
                {selectedMetrics.map((metricId) => {
                  const metric = availableMetrics.find((m) => m.id === metricId)
                  return (
                    <span
                      key={metricId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
                    >
                      {metric?.label}
                      <button
                        onClick={() => handleMetricToggle(metricId)}
                        className="hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded-full p-0.5"
                        disabled={selectedMetrics.length === 1}
                        title={selectedMetrics.length === 1 ? 'At least one metric required' : 'Remove metric'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-[rgb(45,45,45)] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          {loading ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-gray-600 dark:text-gray-400">Loading chart data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading data</p>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{error}</p>
                <button
                  onClick={fetchData}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : metricsData.length > 0 ? (
            <MultiMetricChart data={metricsData} metrics={selectedMetrics} />
          ) : (
            <div className="h-[500px] flex items-center justify-center">
              <p className="text-gray-600 dark:text-gray-400">Select at least one metric to display</p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            About This Chart
          </h2>
          <p className="text-blue-800 dark:text-blue-200 text-sm">
            This chart displays Apple (AAPL) financial data from annual reports. You can compare up to 4 metrics
            simultaneously. Currency values are shown in billions (B). When comparing metrics with different
            scales (e.g., Revenue vs EPS), dual Y-axes are used for better visualization.
          </p>
        </div>
      </main>
    </div>
  )
}
