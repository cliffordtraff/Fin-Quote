import { getEditorialTemplate } from '@/lib/newsletter/editorial-templates'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import { resolveEditorialChart } from '@/lib/newsletter/resolve-chart'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterPeriodType,
} from '@/lib/newsletter/types'
import type { ChartExportSpec } from '@/types/chart-export'

export interface DashboardChartOfTheDaySelection {
  ticker: string
  templateId: string
  periodType: NewsletterPeriodType
}

export type DashboardChartOfTheDayChartSpec = FundamentalsNewsletterChartSpec

export const DASHBOARD_CHART_OF_THE_DAY_LABEL = 'Chart of the Day'
export const DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION: DashboardChartOfTheDaySelection = {
  ticker: 'AAPL',
  templateId: 'revenue_vs_net_income',
  periodType: 'annual',
}
export const DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID = 'custom'
export const DASHBOARD_CHART_OF_THE_DAY_SYMBOL =
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.ticker
export const DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID =
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.templateId
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH = 1600
export const DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT = 1014
export const DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH = 980
export const DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT = 720

function stripTrailingYearRangeSuffix(value: string): string {
  return value.replace(/\s*\(\s*(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\s*\)\s*$/u, '').trim()
}

function normalizeTicker(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase()
  return normalized || DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.ticker
}

function normalizeStringArray(
  values: unknown,
  transform?: (value: string) => string,
): string[] {
  if (!Array.isArray(values)) return []

  const normalizedValues = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .map((value) => (transform ? transform(value) : value))

  return Array.from(new Set(normalizedValues))
}

function normalizePeriodType(value: unknown): NewsletterPeriodType {
  return value === 'quarterly' ? 'quarterly' : 'annual'
}

function normalizeChartType(
  value: unknown,
): FundamentalsNewsletterChartSpec['chartType'] | undefined {
  return value === 'line' || value === 'area' || value === 'bar' ? value : undefined
}

function normalizeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.trunc(value)
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeColorMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const entries = Object.entries(value).flatMap(([metricId, color]) => {
    const normalizedMetricId = metricId.trim()
    const normalizedColor = typeof color === 'string' ? color.trim() : ''

    if (!normalizedMetricId || !normalizedColor) {
      return []
    }

    return [[normalizedMetricId, normalizedColor] as const]
  })

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

export function normalizeDashboardChartOfTheDaySelection(
  value?: Partial<DashboardChartOfTheDaySelection> | null,
): DashboardChartOfTheDaySelection {
  const requestedTemplateId = value?.templateId?.trim()
  const requestedTemplate = requestedTemplateId
    ? getEditorialTemplate(requestedTemplateId)
    : undefined
  const fallbackTemplate = getEditorialTemplate(
    DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.templateId,
  )
  const template =
    requestedTemplate && requestedTemplate.mode !== 'price'
      ? requestedTemplate
      : fallbackTemplate
  const fundamentalsTemplate =
    template && template.mode !== 'price' ? template : undefined

  const templateId =
    fundamentalsTemplate?.id ?? DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.templateId
  const requestedPeriodType = value?.periodType ?? DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.periodType
  const periodType =
    fundamentalsTemplate?.supportedPeriods.includes(requestedPeriodType)
      ? requestedPeriodType
      : (fundamentalsTemplate?.defaultPeriodType ??
          DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION.periodType)

  return {
    ticker: normalizeTicker(value?.ticker),
    templateId,
    periodType,
  }
}

export function normalizeDashboardChartOfTheDayChartSpec(
  value?: Partial<ChartExportSpec> | null,
): DashboardChartOfTheDayChartSpec | null {
  const stocks = normalizeStringArray(value?.stocks, (stock) => normalizeTicker(stock))
  const metrics = normalizeStringArray(value?.metrics)

  if (stocks.length === 0 || metrics.length === 0) {
    return null
  }

  const rawMinYear = normalizeInteger(value?.minYear)
  const rawMaxYear = normalizeInteger(value?.maxYear)
  const minYear =
    typeof rawMinYear === 'number' && typeof rawMaxYear === 'number'
      ? Math.min(rawMinYear, rawMaxYear)
      : rawMinYear
  const maxYear =
    typeof rawMinYear === 'number' && typeof rawMaxYear === 'number'
      ? Math.max(rawMinYear, rawMaxYear)
      : rawMaxYear

  return {
    mode: 'fundamentals',
    stocks,
    metrics,
    periodType: normalizePeriodType(value?.periodType),
    minYear,
    maxYear,
    showStockPrice: normalizeBoolean(value?.showStockPrice),
    chartType: normalizeChartType(value?.chartType),
    showLabels: normalizeBoolean(value?.showLabels),
    stacked: normalizeBoolean(value?.stacked),
    indexToZero: normalizeBoolean(value?.indexToZero),
    title: normalizeOptionalText(value?.title),
    subtitle: normalizeOptionalText(value?.subtitle),
    colors: normalizeColorMap(value?.colors),
  }
}

export function getDashboardChartOfTheDaySpec(
  selection: DashboardChartOfTheDaySelection = DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
): NewsletterChartSpec {
  const normalizedSelection = normalizeDashboardChartOfTheDaySelection(selection)
  const { spec } = resolveEditorialChart(normalizedSelection.templateId, {
    ticker: normalizedSelection.ticker,
    periodType: normalizedSelection.periodType,
  })

  if (isPriceNewsletterChartSpec(spec)) {
    return spec
  }

  const cleanedTitle = stripTrailingYearRangeSuffix(spec.title?.trim() ?? '')

  return {
    ...spec,
    title: cleanedTitle || undefined,
    colors: {
      ...(spec.colors ?? {}),
      ...(spec.metrics.includes('revenue') ? { revenue: '#7a9460' } : {}),
    },
  }
}
