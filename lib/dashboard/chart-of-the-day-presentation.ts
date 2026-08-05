import type { MetricData } from '@/app/actions/chart-metrics'
import { getSpecMetricLabel, toSpecMetricId } from '@/lib/charting-metric-bridge'
import type { FundamentalsNewsletterChartSpec } from '@/lib/newsletter/types'

export type DashboardChartUnit = MetricData['unit']

export interface DashboardChartPoint {
  key: string
  label: string
  value: number
  year: number
  fiscalQuarter: number | null
}
export interface DashboardChartSeries {
  id: string
  label: string
  unit: DashboardChartUnit
  kind: 'bar' | 'line' | 'area'
  points: DashboardChartPoint[]
}

export interface DashboardChartOfTheDayPresentation {
  symbol: string
  title: string
  subtitle: string | null
  periodType: 'annual' | 'quarterly'
  periodLabel: string
  minYear: number | null
  maxYear: number | null
  indexed: boolean
  series: DashboardChartSeries[]
}

const MAX_DASHBOARD_SERIES = 3
const MAX_ANNUAL_POINTS = 12
const MAX_QUARTERLY_POINTS = 16

function pointKey(point: MetricData['data'][number]): string {
  return point.fiscal_quarter
    ? `${point.year}-Q${point.fiscal_quarter}`
    : String(point.year)
}

function pointLabel(point: MetricData['data'][number]): string {
  if (point.fiscal_label?.trim()) {
    return point.fiscal_label
      .replace(/^FY/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return point.fiscal_quarter
    ? `${point.year} Q${point.fiscal_quarter}`
    : String(point.year)
}

function comparePoints(
  left: MetricData['data'][number],
  right: MetricData['data'][number],
): number {
  if (left.year !== right.year) return left.year - right.year
  return (left.fiscal_quarter ?? 0) - (right.fiscal_quarter ?? 0)
}

function normalizePoints(
  data: MetricData['data'],
  limit: number,
): DashboardChartPoint[] {
  return data
    .filter((point) => Number.isFinite(point.value))
    .sort(comparePoints)
    .slice(-limit)
    .map((point) => ({
      key: pointKey(point),
      label: pointLabel(point),
      value: point.value,
      year: point.year,
      fiscalQuarter: point.fiscal_quarter ?? null,
    }))
}

function indexSeries(series: DashboardChartSeries): DashboardChartSeries {
  const baseline = series.points.find((point) => point.value !== 0)?.value
  if (!baseline) return series

  return {
    ...series,
    unit: 'percent',
    kind: 'line',
    points: series.points.map((point) => ({
      ...point,
      value: ((point.value / baseline) - 1) * 100,
    })),
  }
}

function metricKind(
  spec: FundamentalsNewsletterChartSpec,
  metricId: string,
): DashboardChartSeries['kind'] {
  if (metricId === 'stock_price') return 'line'
  return spec.chartType ?? 'bar'
}

export function buildDashboardChartOfTheDayPresentation(
  spec: FundamentalsNewsletterChartSpec,
  financialData: MetricData[] = [],
  priceData: MetricData | null = null,
): DashboardChartOfTheDayPresentation {
  const symbol = spec.stocks[0]?.trim().toUpperCase() || 'MARKET'
  const periodType = spec.periodType ?? 'annual'
  const limit = periodType === 'quarterly'
    ? MAX_QUARTERLY_POINTS
    : MAX_ANNUAL_POINTS
  const wantsPrice = spec.showStockPrice === true
    || spec.metrics.some((metric) => toSpecMetricId(metric) === 'stock_price')
  const maxFinancialSeries = Math.max(
    1,
    MAX_DASHBOARD_SERIES - (wantsPrice && priceData ? 1 : 0),
  )
  const requestedMetricIds = new Set(
    spec.metrics.map((metric) => toSpecMetricId(metric)),
  )

  const financialSeries = financialData
    .filter((metric) => requestedMetricIds.has(toSpecMetricId(metric.metric)))
    .slice(0, maxFinancialSeries)
    .map((metric) => {
      const metricId = toSpecMetricId(metric.metric)
      return {
        id: metricId,
        label: metric.label || getSpecMetricLabel(metricId),
        unit: metric.unit,
        kind: metricKind(spec, metricId),
        points: normalizePoints(metric.data, limit),
      } satisfies DashboardChartSeries
    })
    .filter((series) => series.points.length > 0)

  const resolvedPriceSeries = wantsPrice && priceData
    ? [{
        id: 'stock_price',
        label: priceData.label || 'Stock Price',
        unit: 'price' as const,
        kind: 'line' as const,
        points: normalizePoints(priceData.data, limit).filter((point) => point.value > 0),
      }]
    : []

  const rawSeries = [...financialSeries, ...resolvedPriceSeries]
    .filter((series) => series.points.length > 0)
    .slice(0, MAX_DASHBOARD_SERIES)
  const series = spec.indexToZero
    ? rawSeries.map(indexSeries)
    : rawSeries
  const years = series.flatMap((item) => item.points.map((point) => point.year))
  const minYear = years.length > 0 ? Math.min(...years) : null
  const maxYear = years.length > 0 ? Math.max(...years) : null
  const rangeLabel = minYear && maxYear
    ? minYear === maxYear
      ? String(minYear)
      : `${minYear}–${maxYear}`
    : null

  return {
    symbol,
    title: spec.title?.trim() || `${symbol} fundamentals`,
    subtitle: spec.subtitle?.trim() || null,
    periodType,
    periodLabel: [periodType === 'quarterly' ? 'Quarterly' : 'Annual', rangeLabel]
      .filter(Boolean)
      .join(' · '),
    minYear,
    maxYear,
    indexed: spec.indexToZero === true,
    series,
  }
}
