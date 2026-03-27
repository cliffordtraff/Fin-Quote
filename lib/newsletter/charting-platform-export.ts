import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  PriceNewsletterChartSpec,
} from './types'
import { isPriceNewsletterChartSpec } from './chart-spec'

export const DEFAULT_CHARTING_BASE_URL = 'https://charts.theintraday.com'
export const DEFAULT_LOCAL_CHARTING_BASE_URL = 'http://localhost:3000'
const DEFAULT_NEWSLETTER_CHART_THEME = 'light'

const LEGACY_TO_CHARTING_METRIC_MAP = {
  revenue: 'revenue',
  net_income: 'netIncome',
  free_cash_flow: 'freeCashFlow',
  gross_margin: 'grossMargin',
  operating_margin: 'operatingMargin',
  operating_income: 'operatingIncome',
  eps: 'eps',
  debt_to_equity_ratio: 'debtEquityRatio',
  rd_pct_revenue: 'rdPctRevenue',
  stock_price: 'stockPrice',
} as const

const SUPPORTED_CHARTING_METRICS = new Set<string>([
  'revenue',
  'netIncome',
  'freeCashFlow',
  'grossMargin',
  'operatingMargin',
  'operatingIncome',
  'eps',
  'debtEquityRatio',
  'rdPctRevenue',
  'stockPrice',
])

type NewsletterChartTheme = 'light' | 'dark'

export interface ResolveChartingPlatformNewsletterOptions {
  chartBaseUrl: string
  width?: number
  height?: number
  theme?: NewsletterChartTheme
}

export interface ResolvedChartingPlatformNewsletterChart {
  ticker: string
  captureUrl: string
  interactiveUrl: string
  captureSpec: Record<string, unknown>
  fundState?: Record<string, unknown>
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new Error('chartBaseUrl is required')
  }
  return trimmed.replace(/\/+$/, '')
}

function normalizeHostHeaderValue(hostHeader: string | null | undefined): string {
  const trimmed = hostHeader?.trim().toLowerCase() ?? ''
  if (!trimmed) return ''

  if (trimmed.startsWith('[')) {
    const endBracket = trimmed.indexOf(']')
    if (endBracket >= 0) {
      return trimmed.slice(1, endBracket)
    }
  }

  const firstColon = trimmed.indexOf(':')
  return firstColon >= 0 ? trimmed.slice(0, firstColon) : trimmed
}

export function isLocalChartingHost(hostHeader: string | null | undefined): boolean {
  const normalized = normalizeHostHeaderValue(hostHeader)
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
  )
}

function normalizeTicker(value: string): string {
  const ticker = value.trim().toUpperCase()
  if (!ticker) {
    throw new Error('Chart export spec is missing a ticker')
  }
  return ticker
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function mapMetricId(metricId: string): string {
  const trimmed = metricId.trim()
  if (!trimmed) {
    throw new Error('Chart export spec contains an empty metric id')
  }

  const mapped =
    LEGACY_TO_CHARTING_METRIC_MAP[
      trimmed as keyof typeof LEGACY_TO_CHARTING_METRIC_MAP
    ] ?? trimmed

  if (!SUPPORTED_CHARTING_METRICS.has(mapped)) {
    throw new Error(`Unsupported newsletter metric for Charting Platform: "${metricId}"`)
  }

  return mapped
}

function mapMetricColors(
  colors: FundamentalsNewsletterChartSpec['colors'],
): Record<string, string> {
  if (!colors) return {}

  const mappedColors: Record<string, string> = {}
  for (const [metricId, color] of Object.entries(colors)) {
    const trimmedColor = typeof color === 'string' ? color.trim() : ''
    if (!trimmedColor) continue
    mappedColors[mapMetricId(metricId)] = trimmedColor
  }
  return mappedColors
}

export function stripTrailingYearRangeSuffix(value: string): string {
  return value.replace(/\s*\(\s*(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\s*\)\s*$/u, '').trim()
}

function buildChartTitleText(spec: FundamentalsNewsletterChartSpec): string {
  const title = stripTrailingYearRangeSuffix(spec.title?.trim() ?? '')
  const subtitle = stripTrailingYearRangeSuffix(spec.subtitle?.trim() ?? '')
  return title || subtitle
}

function buildCaptureUrl(
  chartBaseUrl: string,
  captureSpec: Record<string, unknown>,
): string {
  const captureUrl = new URL('/tos/export/newsletter', `${chartBaseUrl}/`)
  captureUrl.searchParams.set('spec', encodeBase64UrlJson(captureSpec))
  return captureUrl.toString()
}

export function getDefaultChartingBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CHARTING_URL?.trim()
  if (configured) {
    return normalizeBaseUrl(configured)
  }

  if (process.env.NODE_ENV !== 'production') {
    return normalizeBaseUrl(DEFAULT_LOCAL_CHARTING_BASE_URL)
  }

  return normalizeBaseUrl(
    DEFAULT_CHARTING_BASE_URL,
  )
}

export function getDefaultChartingBaseUrlForHost(
  hostHeader: string | null | undefined,
): string {
  if (isLocalChartingHost(hostHeader)) {
    return normalizeBaseUrl(DEFAULT_LOCAL_CHARTING_BASE_URL)
  }

  const configured = process.env.NEXT_PUBLIC_CHARTING_URL?.trim()
  if (configured) {
    return normalizeBaseUrl(configured)
  }

  return getDefaultChartingBaseUrl()
}

export function getDefaultPublicChartingBaseUrl(): string {
  const configured = process.env.NEWSLETTER_PUBLIC_CHARTING_URL?.trim()
  if (configured) {
    return normalizeBaseUrl(configured)
  }

  if (process.env.NODE_ENV !== 'production') {
    return normalizeBaseUrl(DEFAULT_LOCAL_CHARTING_BASE_URL)
  }

  return normalizeBaseUrl(
    DEFAULT_CHARTING_BASE_URL,
  )
}

export function getDefaultPublicChartingBaseUrlForHost(
  hostHeader: string | null | undefined,
): string {
  if (isLocalChartingHost(hostHeader)) {
    return normalizeBaseUrl(DEFAULT_LOCAL_CHARTING_BASE_URL)
  }

  const configured = process.env.NEWSLETTER_PUBLIC_CHARTING_URL?.trim()
  if (configured) {
    return normalizeBaseUrl(configured)
  }

  return getDefaultPublicChartingBaseUrl()
}

export function resolveChartingPlatformNewsletterChart(
  spec: NewsletterChartSpec,
  options: ResolveChartingPlatformNewsletterOptions,
): ResolvedChartingPlatformNewsletterChart {
  if (isPriceNewsletterChartSpec(spec)) {
    return resolvePriceNewsletterChart(spec, options)
  }

  return resolveFundamentalsNewsletterChart(spec, options)
}

function resolveFundamentalsNewsletterChart(
  spec: FundamentalsNewsletterChartSpec,
  options: ResolveChartingPlatformNewsletterOptions,
): ResolvedChartingPlatformNewsletterChart {
  const ticker = normalizeTicker(spec.stocks[0] ?? '')
  const compareSymbols = uniqueStrings(
    (spec.stocks ?? [])
      .slice(1)
      .map((symbol) => normalizeTicker(symbol))
      .filter((symbol) => symbol !== ticker),
  )
  const chartBaseUrl = normalizeBaseUrl(options.chartBaseUrl)
  const theme = options.theme ?? DEFAULT_NEWSLETTER_CHART_THEME
  const metricKeys = uniqueStrings((spec.metrics ?? []).map(mapMetricId))

  if (metricKeys.length === 0) {
    throw new Error('Chart export spec must include at least one mapped metric')
  }

  const visibleMetrics = metricKeys.slice()
  if (spec.showStockPrice && visibleMetrics.indexOf('stockPrice') < 0) {
    visibleMetrics.push('stockPrice')
  }

  const addedMetrics = visibleMetrics.slice()
  const activeMetric = metricKeys[0] ?? visibleMetrics[0] ?? ''
  const chartTitleText = buildChartTitleText(spec)
  const metricColors = mapMetricColors(spec.colors)

  const fundState = {
    active: true,
    workspaceMode: 'fundamentals',
    symbol: ticker,
    compareSymbols,
    period: spec.periodType === 'quarterly' ? 'quarter' : 'annual',
    chartType:
      spec.chartType === 'line' || spec.chartType === 'area'
        ? spec.chartType
        : 'bar',
    exportColors: false,
    showLabels: spec.showLabels !== false,
    showTooltip: true,
    hoverFocusEnabled: true,
    gradientBars: false,
    brandColorsMode: 'off',
    stacked: spec.stacked === true,
    indexed: spec.indexToZero === true,
    sliderOnlyMode: true,
    yearRangeCustomized:
      Number.isFinite(spec.minYear) || Number.isFinite(spec.maxYear),
    metricColors,
    addedMetrics,
    visibleMetrics,
    activeMetric,
    activeSeriesId: activeMetric ? `${ticker}::${activeMetric}` : '',
    chartTitleCustomized: Boolean(chartTitleText),
    chartTitleText,
    chartTitleLeft: null,
    chartTitleTop: null,
    autoAnnotationLeft: null,
    autoAnnotationTop: null,
    minYear: Number.isFinite(spec.minYear) ? spec.minYear : null,
    maxYear: Number.isFinite(spec.maxYear) ? spec.maxYear : null,
  }

  const captureSpec = {
    version: 1,
    mode: 'fundamentals',
    ticker,
    symbol: ticker,
    theme,
    width: options.width,
    height: options.height,
    fundSymbol: ticker,
    fundState,
  }

  const interactiveUrl = new URL(`/tos/${encodeURIComponent(ticker)}`, `${chartBaseUrl}/`)
  interactiveUrl.searchParams.set('view', 'fundamentals')
  interactiveUrl.searchParams.set('theme', theme)
  interactiveUrl.searchParams.set('fundSymbol', ticker)
  interactiveUrl.searchParams.set('fundState', encodeBase64UrlJson(fundState))

  return {
    ticker,
    captureUrl: buildCaptureUrl(chartBaseUrl, captureSpec),
    interactiveUrl: interactiveUrl.toString(),
    captureSpec,
    fundState,
  }
}

function resolvePriceNewsletterChart(
  spec: PriceNewsletterChartSpec,
  options: ResolveChartingPlatformNewsletterOptions,
): ResolvedChartingPlatformNewsletterChart {
  const ticker = normalizeTicker(spec.symbol)
  const chartBaseUrl = normalizeBaseUrl(options.chartBaseUrl)
  const theme = options.theme ?? DEFAULT_NEWSLETTER_CHART_THEME
  const chartType: PriceNewsletterChartSpec['chartType'] = 'candles'

  const captureSpec = {
    version: 1,
    mode: 'price',
    ticker,
    symbol: ticker,
    range: spec.range,
    interval: spec.interval,
    chartType,
    theme,
    width: options.width,
    height: options.height,
  }

  const interactiveUrl = new URL(`/tos/${encodeURIComponent(ticker)}`, `${chartBaseUrl}/`)
  interactiveUrl.searchParams.set('view', 'price')
  interactiveUrl.searchParams.set('theme', theme)
  interactiveUrl.searchParams.set('range', spec.range)
  interactiveUrl.searchParams.set('interval', spec.interval)
  interactiveUrl.searchParams.set('chartType', chartType)

  return {
    ticker,
    captureUrl: buildCaptureUrl(chartBaseUrl, captureSpec),
    interactiveUrl: interactiveUrl.toString(),
    captureSpec,
  }
}
