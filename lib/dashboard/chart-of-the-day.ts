import {
  resolveChartingPlatformNewsletterChart,
  type ResolvedChartingPlatformNewsletterChart,
  stripTrailingYearRangeSuffix,
} from '@/lib/newsletter/charting-platform-export'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import { resolveEditorialChart } from '@/lib/newsletter/resolve-chart'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'

export const DASHBOARD_CHART_OF_THE_DAY_LABEL = 'Chart of the Day'
export const DASHBOARD_CHART_OF_THE_DAY_SYMBOL = 'AAPL'
export const DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID = 'revenue_vs_net_income'
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH = 1200
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT = 760

export type DashboardChartTheme = 'light' | 'dark'

export interface ResolveDashboardChartOfTheDayOptions {
  chartBaseUrl: string
  theme?: DashboardChartTheme
  width?: number
  height?: number
}

export interface ResolvedDashboardChartOfTheDay
  extends ResolvedChartingPlatformNewsletterChart {
  label: string
  symbol: string
  templateId: string
  spec: NewsletterChartSpec
}

function buildDashboardChartOfTheDaySpec(): NewsletterChartSpec {
  const { spec } = resolveEditorialChart(DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID, {
    ticker: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  })

  if (isPriceNewsletterChartSpec(spec)) {
    return spec
  }

  const cleanedTitle = stripTrailingYearRangeSuffix(spec.title?.trim() ?? '')

  return {
    ...spec,
    title: cleanedTitle || undefined,
  }
}

export function resolveDashboardChartOfTheDay(
  options: ResolveDashboardChartOfTheDayOptions,
): ResolvedDashboardChartOfTheDay {
  const spec = buildDashboardChartOfTheDaySpec()
  const resolved = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl: options.chartBaseUrl,
    theme: options.theme ?? 'light',
    width: options.width ?? DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
    height: options.height ?? DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  })

  return {
    ...resolved,
    label: DASHBOARD_CHART_OF_THE_DAY_LABEL,
    symbol: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    templateId: DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
    spec,
  }
}
