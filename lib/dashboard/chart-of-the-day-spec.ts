import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import { resolveEditorialChart } from '@/lib/newsletter/resolve-chart'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'

export const DASHBOARD_CHART_OF_THE_DAY_LABEL = 'Chart of the Day'
export const DASHBOARD_CHART_OF_THE_DAY_SYMBOL = 'AAPL'
export const DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID = 'revenue_vs_net_income'
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH = 1200
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT = 760

function stripTrailingYearRangeSuffix(value: string): string {
  return value.replace(/\s*\(\s*(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\s*\)\s*$/u, '').trim()
}

export function getDashboardChartOfTheDaySpec(): NewsletterChartSpec {
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
