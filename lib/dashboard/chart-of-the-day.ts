import {
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  getDashboardChartOfTheDaySpec,
} from './chart-of-the-day-spec'
import { readdirSync } from 'fs'
import { resolve } from 'path'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import {
  getDefaultPublicChartingBaseUrlForHost,
  resolveChartingPlatformNewsletterChart,
} from '@/lib/newsletter/charting-platform-export'
import { getChartingPlatformRenderUrl } from '@/lib/newsletter/capture'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'

export interface ResolveDashboardChartOfTheDayOptions {
  hostHeader?: string | null
  theme?: 'light' | 'dark'
}

export interface ResolvedDashboardChartOfTheDay {
  label: string
  symbol: string
  templateId: string
  spec: NewsletterChartSpec
  chartBaseUrl: string
  renderUrl: string
  captureUrl: string
  interactiveUrl: string
  captureSpec: Record<string, unknown>
}

export interface DashboardChartOfTheDayFallbackImage {
  absolutePath: string
  publicUrl: string
}

export function resolveDashboardChartOfTheDay(
  options: ResolveDashboardChartOfTheDayOptions = {},
): ResolvedDashboardChartOfTheDay {
  const spec = getDashboardChartOfTheDaySpec()

  if (isPriceNewsletterChartSpec(spec)) {
    throw new Error('Dashboard chart of the day must resolve to a fundamentals export spec')
  }

  const chartBaseUrl = getDefaultPublicChartingBaseUrlForHost(options.hostHeader)
  const resolvedChart = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl,
    width: DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
    height: DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
    theme: options.theme ?? 'light',
  })

  return {
    label: DASHBOARD_CHART_OF_THE_DAY_LABEL,
    symbol: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    templateId: DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
    spec,
    chartBaseUrl,
    renderUrl: getChartingPlatformRenderUrl(chartBaseUrl),
    captureUrl: resolvedChart.captureUrl,
    interactiveUrl: resolvedChart.interactiveUrl,
    captureSpec: resolvedChart.captureSpec,
  }
}

export function findDashboardChartOfTheDayFallbackImage():
  | DashboardChartOfTheDayFallbackImage
  | null {
  const chartDir = resolve(process.cwd(), 'public/newsletter-charts')
  const prefix = `${DASHBOARD_CHART_OF_THE_DAY_SYMBOL}_${DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID}_`

  try {
    const latestFilename = readdirSync(chartDir)
      .filter((filename) => filename.startsWith(prefix) && filename.endsWith('.png'))
      .sort()
      .at(-1)

    if (!latestFilename) return null

    return {
      absolutePath: resolve(chartDir, latestFilename),
      publicUrl: `/newsletter-charts/${latestFilename}`,
    }
  } catch {
    return null
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
