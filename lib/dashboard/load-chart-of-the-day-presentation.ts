import { unstable_cache } from 'next/cache'
import { getChartPriceData } from '@/app/actions/chart-price'
import {
  getMultipleMetrics,
  type MetricData,
} from '@/app/actions/chart-metrics'
import { toSpecMetricId } from '@/lib/charting-metric-bridge'
import type { FundamentalsNewsletterChartSpec } from '@/lib/newsletter/types'
import { getDashboardChartOfTheDaySetting } from './chart-of-the-day-settings'
import {
  buildDashboardChartOfTheDayPresentation,
  type DashboardChartOfTheDayPresentation,
} from './chart-of-the-day-presentation'

interface CachedPresentationData {
  financialData: MetricData[]
  priceData: MetricData | null
}

const loadCachedPresentationData = unstable_cache(
  async (serializedSpec: string): Promise<CachedPresentationData> => {
    const spec = JSON.parse(serializedSpec) as FundamentalsNewsletterChartSpec
    const symbol = spec.stocks[0]?.trim().toUpperCase()
    if (!symbol) {
      return { financialData: [], priceData: null }
    }

    const metricIds = spec.metrics
      .map((metric) => toSpecMetricId(metric))
      .filter((metric) => metric !== 'stock_price')
    const metricsResult = metricIds.length > 0
      ? await getMultipleMetrics({
          symbol,
          metrics: metricIds,
          minYear: spec.minYear,
          maxYear: spec.maxYear,
          period: spec.periodType ?? 'annual',
          limit: spec.periodType === 'quarterly' ? 16 : 12,
        })
      : { data: [] as MetricData[], error: null }
    const financialData = metricsResult.data ?? []
    const wantsPrice = spec.showStockPrice === true
      || spec.metrics.some((metric) => toSpecMetricId(metric) === 'stock_price')

    if (!wantsPrice) {
      return { financialData, priceData: null }
    }

    const periodEndDates = financialData
      .find((series) => series.data.some((point) => point.date))
      ?.data
      .filter((point) => point.date)
      .map((point) => ({
        date: point.date as string,
        year: point.year,
        fiscal_quarter: point.fiscal_quarter,
        fiscal_label: point.fiscal_label,
      })) ?? []

    const priceResult = await getChartPriceData({
      symbol,
      periodEndDates: periodEndDates.length > 0 ? periodEndDates : undefined,
      periodType: spec.periodType ?? 'annual',
      minYear: spec.minYear,
      maxYear: spec.maxYear,
    })

    return {
      financialData,
      priceData: priceResult.data,
    }
  },
  ['dashboard-chart-of-the-day-presentation-v1'],
  { revalidate: 60 * 60 },
)

export async function loadDashboardChartOfTheDayPresentation(): Promise<DashboardChartOfTheDayPresentation> {
  const setting = await getDashboardChartOfTheDaySetting()
  const spec = setting.chartSpec

  try {
    const { financialData, priceData } = await loadCachedPresentationData(
      JSON.stringify(spec),
    )
    return buildDashboardChartOfTheDayPresentation(spec, financialData, priceData)
  } catch (error) {
    console.error(
      'Failed to load the dashboard Chart of the Day presentation:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return buildDashboardChartOfTheDayPresentation(spec)
  }
}
