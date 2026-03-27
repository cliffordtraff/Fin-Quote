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
import { getMonthlyChartPriceData } from '@/app/actions/chart-price'
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
  const [embedViewportHeight, setEmbedViewportHeight] = useState(520)
  const isEmbedded = searchParams.get('embed') === 'true'
  const hideBranding = searchParams.get('hideBranding') === 'true'
  const autoSize = searchParams.get('autosize') === 'true'
  const isAutoSizedEmbed = isEmbedded && autoSize
  const requestedTheme = searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const isDarkTheme = requestedTheme === 'dark'

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
  const surfaceBackgroundClass = isDarkTheme ? 'bg-slate-800' : 'bg-white'
  const surfaceBackgroundColor = isDarkTheme ? '#1e293b' : '#ffffff'
  const titleTextClass = isDarkTheme ? 'text-slate-100' : 'text-gray-900'
  const subtitleTextClass = isDarkTheme ? 'text-slate-400' : 'text-gray-500'
  const loadingTextClass = isDarkTheme ? 'text-slate-400' : 'text-gray-400'
  const shellClassName = isAutoSizedEmbed
    ? `h-full min-h-full w-full overflow-hidden ${surfaceBackgroundClass}`
    : isEmbedded
    ? `flex h-screen w-full flex-col overflow-hidden ${surfaceBackgroundClass}`
    : `flex w-[1200px] flex-col ${surfaceBackgroundClass}`
  const loadingShellClassName = isAutoSizedEmbed
    ? `h-full min-h-[520px] w-full flex items-center justify-center ${surfaceBackgroundClass}`
    : isEmbedded
    ? `h-screen w-full flex items-center justify-center ${surfaceBackgroundClass}`
    : `w-[1200px] h-[700px] flex items-center justify-center ${surfaceBackgroundClass}`
  const titleClassName = isEmbedded ? 'px-4 pt-3 pb-0' : 'px-8 pt-6 pb-1'
  const chartWrapClassName = isAutoSizedEmbed
    ? 'px-4 pt-1 pb-1'
    : isEmbedded
    ? 'flex-1 min-h-0 px-4 pt-1 pb-1'
    : 'px-6 pt-2 pb-1'
  const footerClassName = isEmbedded ? 'px-4 pb-3 pt-1 flex justify-end' : 'px-8 pb-2 flex justify-end'
  const chartHeight = isAutoSizedEmbed
    ? Math.max(460, embedViewportHeight - 88)
    : isEmbedded
    ? Math.max(300, embedViewportHeight - (hideBranding ? 124 : 156))
    : 500
  const embedChartTheme = useMemo(() => {
    if (!isDarkTheme) {
      return {
        backgroundColor: '#ffffff',
        textColor: '#6b7280',
        gridLineColor: '#d1d5db',
        lineColor: '#374151',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e5e7eb',
        tooltipText: '#1f2937',
      }
    }

    return {
      backgroundColor: '#1e293b',
      textColor: '#cbd5e1',
      gridLineColor: 'rgba(148, 163, 184, 0.28)',
      lineColor: '#94a3b8',
      tooltipBg: '#0f172a',
      tooltipBorder: '#334155',
      tooltipText: '#f8fafc',
    }
  }, [isDarkTheme])

  useEffect(() => {
    if (!isEmbedded) return

    const syncViewportHeight = () => {
      setEmbedViewportHeight(window.innerHeight)
    }

    syncViewportHeight()
    window.addEventListener('resize', syncViewportHeight)
    return () => window.removeEventListener('resize', syncViewportHeight)
  }, [isEmbedded])

  useEffect(() => {
    if (!isAutoSizedEmbed || !ready || typeof window === 'undefined') return

    const postHeight = () => {
      window.parent.postMessage(
        {
          type: 'dashboard-chart-of-the-day-height',
          height: document.documentElement.scrollHeight,
        },
        window.location.origin,
      )
    }

    postHeight()

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(postHeight)
    })

    observer.observe(document.documentElement)
    observer.observe(document.body)
    window.addEventListener('resize', postHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', postHeight)
    }
  }, [isAutoSizedEmbed, ready, metricsData.length])

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
            const priceResult = await getMonthlyChartPriceData({
              symbol,
              minYear,
              maxYear,
              granularity: periodType === 'annual' ? 'weekly' : 'monthly',
            })
            if (priceResult.data) {
              const prefixedId = stocks.length > 1 ? `${symbol}:stock_price` : 'stock_price'
              const prefixedLabel = stocks.length > 1 ? `${symbol} Stock Price` : 'Stock Price'
              return { ...priceResult.data, metric: prefixedId as MetricId, label: prefixedLabel }
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
    const defaultColors = getMetricColors(isDarkTheme)
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
  }, [metricsData, config?.colors, config?.stocks.length, isDarkTheme])

  if (error) {
    return (
      <div className={loadingShellClassName} style={{ backgroundColor: surfaceBackgroundColor }}>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={loadingShellClassName} style={{ backgroundColor: surfaceBackgroundColor }}>
        <p className={`${loadingTextClass}`}>Loading chart data...</p>
      </div>
    )
  }

  return (
    <div
      className={shellClassName}
      style={{ backgroundColor: surfaceBackgroundColor }}
      data-export-ready={ready ? 'true' : 'false'}
    >
      {/* Title area */}
      {(config?.title || config?.subtitle) && (
        <div className={titleClassName}>
          {config?.title && (
            <h1 className={`${isEmbedded ? 'text-base' : 'text-3xl'} font-bold leading-tight ${titleTextClass}`}>
              {config.title}
            </h1>
          )}
          {!isEmbedded && config?.subtitle && (
            <p className={`text-lg mt-1 ${subtitleTextClass}`}>{config.subtitle}</p>
          )}
        </div>
      )}

      {/* Chart */}
      <div className={chartWrapClassName}>
        {metricsData.length > 0 ? (
          <MultiMetricChart
            data={metricsData}
            metrics={metricsData.map(d => d.metric)}
            customColors={chartColors}
            exportMode
            chartHeight={chartHeight}
            exportTextScale={isEmbedded ? 'compact' : 'default'}
            initialChartType={config?.chartType}
            initialShowLabels={config?.showLabels}
            initialStacked={config?.stacked}
            initialIndexToZero={config?.indexToZero}
            onChartReady={handleChartReady}
            highchartsTheme={embedChartTheme}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: chartHeight }}>
            <p className={loadingTextClass}>No data to display</p>
          </div>
        )}
      </div>

      {!hideBranding && (
        <div className={footerClassName}>
          <span className={`${isEmbedded ? 'text-[10px]' : 'text-base'} ${subtitleTextClass}`}>
            The Intraday &middot; theintraday.com
          </span>
        </div>
      )}
    </div>
  )
}

export default function ChartExportPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-white">
          <p className="text-gray-400">Loading...</p>
        </div>
      }
    >
      <ChartExportContent />
    </Suspense>
  )
}
