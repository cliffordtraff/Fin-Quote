import {
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  getDashboardChartOfTheDaySpec,
} from './chart-of-the-day-spec'
import { buildExportUrl } from '@/lib/chart-export'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'

export interface ResolveDashboardChartOfTheDayOptions {
  baseUrl?: string
}

export interface ResolvedDashboardChartOfTheDay {
  label: string
  symbol: string
  templateId: string
  spec: NewsletterChartSpec
  exportUrl: string
}

export function resolveDashboardChartOfTheDay(
  options: ResolveDashboardChartOfTheDayOptions = {},
): ResolvedDashboardChartOfTheDay {
  const spec = getDashboardChartOfTheDaySpec()

  if (isPriceNewsletterChartSpec(spec)) {
    throw new Error('Dashboard chart of the day must resolve to a fundamentals export spec')
  }

  return {
    label: DASHBOARD_CHART_OF_THE_DAY_LABEL,
    symbol: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    templateId: DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
    spec,
    exportUrl: buildExportUrl(spec, options.baseUrl),
  }
}

export {
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  getDashboardChartOfTheDaySpec,
}
