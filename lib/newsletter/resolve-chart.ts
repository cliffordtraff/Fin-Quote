import type {
  FundamentalsEditorialChartTemplate,
  NewsletterPeriodType,
  NewsletterChartSpec,
  PriceEditorialChartTemplate,
  ResolveChartOptions,
  ResolvedChart,
} from './types'
import { getEditorialTemplate } from './editorial-templates'

/**
 * Resolve a year-range strategy to concrete minYear / maxYear values.
 */
function resolveYearRange(
  template: FundamentalsEditorialChartTemplate,
  periodType: NewsletterPeriodType,
  override?: { minYear: number; maxYear: number },
): { minYear: number; maxYear: number } {
  if (override) return override

  const currentYear = new Date().getFullYear()
  const rangeStrategy =
    periodType === 'quarterly' && template.quarterlyYearRange
      ? template.quarterlyYearRange
      : template.yearRange

  switch (rangeStrategy.kind) {
    case 'last_n_years':
      return {
        minYear: currentYear - rangeStrategy.n + 1,
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
  vars: Record<string, string | number | undefined>,
): string {
  return pattern.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

/**
 * Turn an editorial template + options into a concrete newsletter chart spec.
 *
 * Example:
 *   resolveEditorialChart('revenue_vs_net_income', { ticker: 'MSFT' })
 *   → { templateId, spec: NewsletterChartSpec }
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

  const stocks = Array.isArray(options.stocks)
    ? options.stocks
        .map((stock) => stock.trim().toUpperCase())
        .filter(Boolean)
    : []
  const ticker = stocks[0] ?? options.ticker?.trim().toUpperCase()
  if (!ticker) {
    throw new Error('ticker is required')
  }

  if (template.mode === 'price') {
    return {
      templateId,
      spec: buildPriceChartSpec(template, ticker, options),
    }
  }

  return {
    templateId,
    spec: buildFundamentalsChartSpec(template, ticker, options),
  }
}

function buildFundamentalsChartSpec(
  template: FundamentalsEditorialChartTemplate,
  ticker: string,
  options: ResolveChartOptions,
): NewsletterChartSpec {
  if (template.metrics.length === 0) {
    throw new Error(`Template "${template.id}" has no metrics defined`)
  }

  if (template.metrics.length > template.maxMetrics) {
    throw new Error(
      `Template "${template.id}" defines ${template.metrics.length} metrics but maxMetrics is ${template.maxMetrics}`,
    )
  }

  const periodType = template.supportedPeriods.includes(options.periodType ?? template.defaultPeriodType)
    ? (options.periodType ?? template.defaultPeriodType)
    : template.defaultPeriodType
  const stocks = Array.isArray(options.stocks)
    ? options.stocks
        .map((stock) => stock.trim().toUpperCase())
        .filter(Boolean)
    : [ticker]
  const { minYear, maxYear } = resolveYearRange(
    template,
    periodType,
    options.yearOverride,
  )

  let showStockPrice = template.priceOverlayDefault
  if (options.showPriceOverride !== undefined) {
    showStockPrice = template.priceOverlayAllowed
      ? options.showPriceOverride
      : false
  }

  const colors = { ...template.defaultColors, ...options.colorsOverride }
  const vars = {
    ticker,
    minYear,
    maxYear,
    periodLabel: periodType === 'quarterly' ? 'Quarterly' : 'Annual',
  }
  const title = options.titleOverride ?? fillPattern(template.titlePattern, vars)
  const subtitle =
    options.subtitleOverride ?? fillPattern(template.subtitlePattern, vars)

  return {
    stocks,
    metrics: template.metrics,
    periodType,
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
}

function buildPriceChartSpec(
  template: PriceEditorialChartTemplate,
  ticker: string,
  options: ResolveChartOptions,
): NewsletterChartSpec {
  const vars = { ticker }
  const title = options.titleOverride ?? fillPattern(template.titlePattern, vars)
  const subtitle =
    options.subtitleOverride ?? fillPattern(template.subtitlePattern, vars)

  return {
    mode: 'price',
    symbol: ticker,
    range: template.range,
    interval: template.interval,
    chartType: template.chartType,
    title,
    subtitle,
  }
}
