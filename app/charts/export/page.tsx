'use client'

/**
 * Chart Export Route — /charts/export
 *
 * Renders a clean, chrome-free chart from a serializable ChartExportSpec.
 * Designed for headless browser screenshot capture (newsletter images).
 *
 * Usage (base64 spec):
 *   /charts/export?spec=eyJzdG9ja3MiOlsiQUFQTCJdLCJtZXRyaWNzIjpbInJldmVudWUiLCJuZXRfaW5jb21lIl19
 *
 * Usage (individual params):
 *   /charts/export?stocks=AAPL&metrics=revenue,net_income&title=AAPL+Revenue+%26+Profit&period=annual
 *
 * Ready signal for headless browser:
 *   - window.__CHART_EXPORT_READY__ === true
 *   - document.querySelector('[data-export-ready="true"]') exists
 *
 * Example headless capture (Puppeteer):
 *   await page.goto(exportUrl, { waitUntil: 'networkidle0' })
 *   await page.waitForFunction(() => window.__CHART_EXPORT_READY__ === true)
 *   await page.setViewport({ width: 1200, height: 700 })
 *   await page.screenshot({ path: 'chart.png' })
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import MultiMetricChart, { getMetricColors } from '@/components/MultiMetricChart'
import { getMultipleMetrics, type MetricData, type MetricId } from '@/app/actions/chart-metrics'
import { getChartPriceData, getMonthlyChartPriceData } from '@/app/actions/chart-price'
import { isPriceMetric } from '@/lib/price-matcher'
import { parseSpecFromParams } from '@/lib/chart-export'
import { CHART_EXPORT_DEFAULTS } from '@/types/chart-export'

// Light mode color palette (same as charts page light palette)
const COLOR_PALETTE = [
  '#1a1a2e', '#2d4a3e', '#4a2c2c', '#3d3520', '#1a3a3a', '#2e2640',
  '#2a3540', '#3a3028', '#1a3a2a', '#3a2a30', '#3a3a20', '#2a2a3a',
]

function ChartExportContent() {
  const searchParams = useSearchParams()
  const [metricsData, setMetricsData] = useState<MetricData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Parse spec from URL (stable across renders since URL doesn't change)
  const spec = useMemo(
    () => parseSpecFromParams(searchParams),
    [searchParams]
  )

  // Merge with defaults
  const config = useMemo(
    () => spec ? { ...CHART_EXPORT_DEFAULTS, ...spec } : null,
    [spec]
  )

  // Stable key for the effect dependency
  const specKey = useMemo(() => JSON.stringify(spec), [spec])

  // Fetch data based on the spec
  useEffect(() => {
    if (!config) {
      setError('Invalid or missing chart spec. Provide ?spec=<base64> or ?stocks=X&metrics=Y')
      setLoading(false)
      return
    }

    async function fetchData() {
      const { stocks, metrics, periodType, minYear, maxYear, showStockPrice } = config!

      setLoading(true)
      setError(null)

      try {
        const nonPriceMetrics = metrics.filter(m => !isPriceMetric(m))

        // Fetch metric data for all stocks in parallel
        const fetchPromises = stocks.map(symbol =>
          nonPriceMetrics.length > 0
            ? getMultipleMetrics({
                symbol,
                metrics: nonPriceMetrics,
                minYear,
                maxYear,
                period: periodType,
              })
            : Promise.resolve({ data: [] as MetricData[], error: null, yearBounds: undefined })
        )

        const results = await Promise.all(fetchPromises)
        const mergedData: MetricData[] = []
        const periodEndDatesByStock: Record<string, Array<{
          date: string
          year: number
          fiscal_quarter?: number | null
          fiscal_label?: string | null
        }>> = {}

        results.forEach((result, index) => {
          const symbol = stocks[index]
          if (result.data) {
            result.data.forEach(metricData => {
              const prefixedId = stocks.length > 1 ? `${symbol}:${metricData.metric}` : metricData.metric
              const prefixedLabel = stocks.length > 1 ? `${symbol} ${metricData.label}` : metricData.label
              mergedData.push({
                ...metricData,
                metric: prefixedId as MetricId,
                label: prefixedLabel,
              })
              if (!periodEndDatesByStock[symbol] && metricData.data.length > 0) {
                periodEndDatesByStock[symbol] = metricData.data
                  .filter(d => d.date)
                  .map(d => ({
                    date: d.date!,
                    year: d.year,
                    fiscal_quarter: d.fiscal_quarter,
                    fiscal_label: d.fiscal_label,
                  }))
              }
            })
          }
        })

        // Fetch price data if requested
        if (showStockPrice) {
          const priceFetchPromises = stocks.map(async symbol => {
            if (periodType === 'annual') {
              const priceResult = await getMonthlyChartPriceData({ symbol, minYear, maxYear })
              if (priceResult.data) {
                const prefixedId = stocks.length > 1 ? `${symbol}:stock_price` : 'stock_price'
                const prefixedLabel = stocks.length > 1 ? `${symbol} Stock Price` : 'Stock Price'
                return { ...priceResult.data, metric: prefixedId as MetricId, label: prefixedLabel }
              }
            } else {
              const periodEndDates = periodEndDatesByStock[symbol]
              const priceResult = await getChartPriceData({
                symbol,
                periodEndDates,
                periodType: periodType!,
                minYear,
                maxYear,
              })
              if (priceResult.data) {
                const prefixedId = stocks.length > 1 ? `${symbol}:stock_price` : 'stock_price'
                const prefixedLabel = stocks.length > 1 ? `${symbol} Stock Price` : 'Stock Price'
                return { ...priceResult.data, metric: prefixedId as MetricId, label: prefixedLabel }
              }
            }
            return null
          })

          const priceResults = await Promise.all(priceFetchPromises)
          priceResults.forEach(priceData => {
            if (priceData) mergedData.push(priceData)
          })
        }

        setMetricsData(mergedData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [specKey]) // eslint-disable-line react-hooks/exhaustive-deps -- config derived from specKey

  // Signal readiness for headless browser capture
  const handleChartReady = useCallback(() => {
    // Small delay to ensure any post-render CSS has settled
    setTimeout(() => {
      setReady(true)
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__CHART_EXPORT_READY__ = true
      }
    }, 100)
  }, [])

  // Build chart colors
  const chartColors = useMemo(() => {
    if (metricsData.length === 0) return {}
    const specColors = config?.colors ?? {}
    const defaultColors = getMetricColors(false) // light mode
    const isMultiStock = (config?.stocks.length ?? 0) > 1
    const result: Record<string, string> = {}

    metricsData.forEach((d, i) => {
      if (specColors[d.metric]) {
        result[d.metric] = specColors[d.metric]
      } else if (!isMultiStock && defaultColors[d.metric]) {
        result[d.metric] = defaultColors[d.metric]
      } else {
        result[d.metric] = COLOR_PALETTE[i % COLOR_PALETTE.length]
      }
    })
    return result
  }, [metricsData, config?.colors, config?.stocks.length])

  if (error) {
    return (
      <div className="w-[1200px] h-[700px] flex items-center justify-center bg-white">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-[1200px] h-[700px] flex items-center justify-center bg-white">
        <p className="text-gray-400">Loading chart data...</p>
      </div>
    )
  }

  return (
    <div
      className="w-[1200px] bg-white"
      style={{ minHeight: 700 }}
      data-export-ready={ready ? 'true' : 'false'}
    >
      {/* Title area */}
      {(config?.title || config?.subtitle) && (
        <div className="px-8 pt-6 pb-1">
          {config?.title && (
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{config.title}</h1>
          )}
          {config?.subtitle && (
            <p className="text-sm text-gray-500 mt-1">{config.subtitle}</p>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="px-6 pt-2">
        {metricsData.length > 0 ? (
          <MultiMetricChart
            data={metricsData}
            metrics={metricsData.map(d => d.metric)}
            customColors={chartColors}
            exportMode
            initialChartType={config?.chartType}
            initialShowLabels={config?.showLabels}
            initialStacked={config?.stacked}
            initialIndexToZero={config?.indexToZero}
            onChartReady={handleChartReady}
          />
        ) : (
          <div className="h-[500px] flex items-center justify-center">
            <p className="text-gray-400">No data to display</p>
          </div>
        )}
      </div>

      {/* Branding footer */}
      <div className="px-8 pb-4 flex justify-end">
        <span className="text-xs text-gray-400">The Intraday &middot; theintraday.com</span>
      </div>
    </div>
  )
}

export default function ChartExportPage() {
  return (
    <Suspense
      fallback={
        <div className="w-[1200px] h-[700px] flex items-center justify-center bg-white">
          <p className="text-gray-400">Loading...</p>
        </div>
      }
    >
      <ChartExportContent />
    </Suspense>
  )
}
