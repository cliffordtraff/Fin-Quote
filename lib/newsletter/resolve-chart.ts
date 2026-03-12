import type { ChartExportSpec } from '@/types/chart-export'
import { buildExportUrl } from '@/lib/chart-export'
import type {
  EditorialChartTemplate,
  ResolveChartOptions,
  ResolvedChart,
} from './types'
import { getEditorialTemplate } from './editorial-templates'

/**
 * Resolve a year-range strategy to concrete minYear / maxYear values.
 */
function resolveYearRange(
  template: EditorialChartTemplate,
  override?: { minYear: number; maxYear: number },
): { minYear: number; maxYear: number } {
  if (override) return override

  const currentYear = new Date().getFullYear()

  switch (template.yearRange.kind) {
    case 'last_n_years':
      return {
        minYear: currentYear - template.yearRange.n + 1,
        maxYear: currentYear,
      }
    case 'all_available':
      // Use a wide window; the chart component clips to available data
      return { minYear: 2000, maxYear: currentYear }
  }
}

/**
 * Fill placeholders in a title/subtitle pattern.
 *
 * Supported placeholders: {ticker}, {minYear}, {maxYear}
 */
function fillPattern(
  pattern: string,
  vars: { ticker: string; minYear: number; maxYear: number },
): string {
  return pattern
    .replace(/\{ticker\}/g, vars.ticker.toUpperCase())
    .replace(/\{minYear\}/g, String(vars.minYear))
    .replace(/\{maxYear\}/g, String(vars.maxYear))
}

/**
 * Turn an editorial template + options into a concrete ChartExportSpec and URL.
 *
 * Example:
 *   resolveEditorialChart('revenue_vs_net_income', { ticker: 'MSFT' })
 *   → { templateId, spec: ChartExportSpec, exportUrl: '/charts/export?spec=...' }
 *
 * Throws if:
 *   - Template ID is unknown
 *   - Ticker is empty
 *   - Metrics array is empty (shouldn't happen with valid templates)
 */
export function resolveEditorialChart(
  templateId: string,
  options: ResolveChartOptions,
): ResolvedChart {
  const template = getEditorialTemplate(templateId)
  if (!template) {
    throw new Error(`Unknown editorial template: "${templateId}"`)
  }

  const ticker = options.ticker?.trim().toUpperCase()
  if (!ticker) {
    throw new Error('ticker is required')
  }

  if (template.metrics.length === 0) {
    throw new Error(`Template "${templateId}" has no metrics defined`)
  }

  if (template.metrics.length > template.maxMetrics) {
    throw new Error(
      `Template "${templateId}" defines ${template.metrics.length} metrics but maxMetrics is ${template.maxMetrics}`,
    )
  }

  // Resolve year range
  const { minYear, maxYear } = resolveYearRange(template, options.yearOverride)

  // Determine price overlay
  let showStockPrice = template.priceOverlayDefault
  if (options.showPriceOverride !== undefined) {
    showStockPrice = template.priceOverlayAllowed
      ? options.showPriceOverride
      : false
  }

  // Merge colors
  const colors = { ...template.defaultColors, ...options.colorsOverride }

  // Fill title/subtitle
  const vars = { ticker, minYear, maxYear }
  const title = options.titleOverride ?? fillPattern(template.titlePattern, vars)
  const subtitle =
    options.subtitleOverride ?? fillPattern(template.subtitlePattern, vars)

  // Build the spec
  const spec: ChartExportSpec = {
    stocks: [ticker],
    metrics: template.metrics,
    periodType: template.periodType,
    minYear,
    maxYear,
    showStockPrice,
    chartType: template.chartType,
    showLabels: true,
    stacked: false,
    indexToZero: false,
    title,
    subtitle,
    colors,
  }

  const exportUrl = buildExportUrl(spec)

  return { templateId, spec, exportUrl }
}
