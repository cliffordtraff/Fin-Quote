import {
  DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID,
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  getDashboardChartOfTheDaySpec,
  type DashboardChartOfTheDayChartSpec,
  type DashboardChartOfTheDaySelection,
} from './chart-of-the-day-spec'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import { resolveChartingPlatformNewsletterChart } from '@/lib/newsletter/charting-platform-export'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import type { ChartExportSpec } from '@/types/chart-export'

const CHARTING_PROXY_BASE_URL = 'https://charting-proxy.theintraday.invalid'
const SPEC_METRIC_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  net_income: 'Net Income',
  free_cash_flow: 'Free Cash Flow',
  gross_margin: 'Gross Margin',
  operating_margin: 'Operating Margin',
  operating_income: 'Operating Income',
  eps: 'EPS',
  debt_to_equity_ratio: 'Debt/Equity',
  rd_pct_revenue: 'R&D % Revenue',
}
const CHARTING_TO_SPEC_METRIC_MAP: Record<string, string> = {
  revenue: 'revenue',
  netIncome: 'net_income',
  freeCashFlow: 'free_cash_flow',
  grossMargin: 'gross_margin',
  operatingMargin: 'operating_margin',
  operatingIncome: 'operating_income',
  eps: 'eps',
  debtEquityRatio: 'debt_to_equity_ratio',
  rdPctRevenue: 'rd_pct_revenue',
  stockPrice: 'stock_price',
}

function normalizeTicker(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function encodeBase64UrlJson(value: unknown): string {
  const json = JSON.stringify(value)

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  const bytes = new TextEncoder().encode(json)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeBase64UrlJson<T>(value: string): T {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4)

  if (typeof Buffer !== 'undefined') {
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as T
  }

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function toRelativeUrl(url: string): string {
  const parsed = new URL(url, CHARTING_PROXY_BASE_URL)
  return `${parsed.pathname}${parsed.search}`
}

function normalizeTickerList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
        .filter(Boolean),
    ),
  )
}

function normalizeMetricList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function normalizeMetricColorMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const entries = Object.entries(value).flatMap(([metricId, color]) => {
    if (typeof color !== 'string' || !color.trim()) return []
    const mappedMetricId = CHARTING_TO_SPEC_METRIC_MAP[metricId] ?? metricId
    if (mappedMetricId === 'stock_price') return []
    return [[mappedMetricId, color.trim()] as const]
  })

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function normalizeFiniteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined
}

function normalizeFundamentalsChartType(
  value: unknown,
): NonNullable<ChartExportSpec['chartType']> {
  return value === 'line' || value === 'area' ? value : 'bar'
}

function resolveFundamentalsChartTypeFromState(
  fundState: Record<string, unknown>,
  rawMetrics: string[],
): NonNullable<ChartExportSpec['chartType']> {
  const metricKeys = rawMetrics.filter((metricId) => metricId !== 'stockPrice')
  if (metricKeys.length === 0) {
    return normalizeFundamentalsChartType(fundState.chartType)
  }

  const metricChartTypes =
    fundState.metricChartTypes &&
    typeof fundState.metricChartTypes === 'object' &&
    !Array.isArray(fundState.metricChartTypes)
      ? (fundState.metricChartTypes as Record<string, unknown>)
      : {}

  const resolvedMetricTypes = Array.from(
    new Set(
      metricKeys
        .map((metricId) => metricChartTypes[metricId])
        .filter((chartType) => chartType === 'bar' || chartType === 'line' || chartType === 'area'),
    ),
  ) as NonNullable<ChartExportSpec['chartType']>[]

  if (metricKeys.length === 1 && resolvedMetricTypes.length > 0) {
    return resolvedMetricTypes[0]
  }

  if (resolvedMetricTypes.length === 1) {
    return resolvedMetricTypes[0]
  }

  return normalizeFundamentalsChartType(fundState.chartType)
}

function buildDashboardInteractiveUrl(
  interactiveUrl: string,
  fundState: Record<string, unknown>,
  options: {
    embed?: boolean
  } = {},
): string {
  const url = new URL(interactiveUrl)
  url.searchParams.set('fundState', encodeBase64UrlJson(fundState))

  if (options.embed) {
    url.searchParams.set('embed', 'true')
  }

  return url.toString()
}

export function resolveDashboardChartOfTheDayEmbedSpec(
  selection: DashboardChartOfTheDaySelection = DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
): NewsletterChartSpec {
  return getDashboardChartOfTheDaySpec(selection)
}

export function resolveDashboardChartOfTheDayEditorPath(
  spec: ChartExportSpec,
  theme: 'light' | 'dark' = 'light',
): string {
  if (isPriceNewsletterChartSpec(spec)) {
    throw new Error('Dashboard editor requires a fundamentals chart spec')
  }

  const resolvedChart = resolveChartingPlatformNewsletterChart(
    spec as NewsletterChartSpec,
    {
      chartBaseUrl: CHARTING_PROXY_BASE_URL,
      width: DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
      height: DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
      theme,
    },
  )

  const editorFundState = {
    ...((resolvedChart.captureSpec.fundState as Record<string, unknown> | undefined) ?? {}),
    sliderOnlyMode: false,
    showTooltip: true,
    hoverFocusEnabled: true,
  }

  return toRelativeUrl(
    buildDashboardInteractiveUrl(
      resolvedChart.interactiveUrl,
      editorFundState,
      { embed: true },
    ),
  )
}

export function replaceDashboardChartOfTheDayEditorPathTheme(
  editorPath: string,
  theme: 'light' | 'dark',
): string {
  const url = new URL(editorPath, CHARTING_PROXY_BASE_URL)
  url.searchParams.set('theme', theme)
  return toRelativeUrl(url.toString())
}

export function parseDashboardChartOfTheDayEditorSpecFromUrl(
  editorUrl: string,
  fallbackSpec: ChartExportSpec | null = null,
): ChartExportSpec | null {
  try {
    const url = new URL(editorUrl, CHARTING_PROXY_BASE_URL)
    const encodedFundState = url.searchParams.get('fundState')?.trim()
    if (!encodedFundState) return null

    const fundState = decodeBase64UrlJson<Record<string, unknown>>(encodedFundState)
    const primarySymbol = normalizeTicker(
      (url.searchParams.get('fundSymbol') || '') ||
        (typeof fundState.symbol === 'string' ? fundState.symbol : '') ||
        url.pathname.split('/').filter(Boolean).at(-1),
    )
    if (!primarySymbol) return null

    const compareSymbols = normalizeTickerList(fundState.compareSymbols).filter(
      (symbol) => symbol !== primarySymbol,
    )
    const visibleMetrics = normalizeMetricList(fundState.visibleMetrics)
    const addedMetrics = normalizeMetricList(fundState.addedMetrics)
    const rawMetrics =
      visibleMetrics.length > 0
        ? visibleMetrics
        : addedMetrics.length > 0
          ? addedMetrics
          : normalizeMetricList(
              typeof fundState.activeMetric === 'string' ? [fundState.activeMetric] : [],
            )
    const showStockPrice = rawMetrics.includes('stockPrice')
    const metrics = rawMetrics
      .filter((metricId) => metricId !== 'stockPrice')
      .map((metricId) => CHARTING_TO_SPEC_METRIC_MAP[metricId] ?? metricId)

    if (metrics.length === 0) return null

    const titleText =
      typeof fundState.chartTitleText === 'string'
        ? fundState.chartTitleText.trim()
        : ''

    return {
      stocks: [primarySymbol, ...compareSymbols],
      metrics,
      periodType: fundState.period === 'quarter' ? 'quarterly' : 'annual',
      minYear: normalizeFiniteInteger(fundState.minYear),
      maxYear: normalizeFiniteInteger(fundState.maxYear),
      showStockPrice,
      chartType: resolveFundamentalsChartTypeFromState(fundState, rawMetrics),
      showLabels: fundState.showLabels !== false,
      stacked: fundState.stacked === true,
      indexToZero: fundState.indexed === true,
      title:
        fundState.chartTitleCustomized === true && titleText
          ? titleText
          : undefined,
      subtitle: fallbackSpec?.subtitle,
      colors: normalizeMetricColorMap(fundState.metricColors),
    }
  } catch {
    return null
  }
}

export function parseDashboardChartOfTheDayEditorSpecFromFundState(
  fundState: Record<string, unknown>,
  symbol: string,
  fallbackSpec: ChartExportSpec | null = null,
): ChartExportSpec | null {
  try {
    const primarySymbol = normalizeTicker(
      symbol || (typeof fundState.symbol === 'string' ? fundState.symbol : ''),
    )
    if (!primarySymbol) return null

    const compareSymbols = normalizeTickerList(fundState.compareSymbols).filter(
      (s) => s !== primarySymbol,
    )
    const visibleMetrics = normalizeMetricList(fundState.visibleMetrics)
    const addedMetrics = normalizeMetricList(fundState.addedMetrics)
    const rawMetrics =
      visibleMetrics.length > 0
        ? visibleMetrics
        : addedMetrics.length > 0
          ? addedMetrics
          : normalizeMetricList(
              typeof fundState.activeMetric === 'string' ? [fundState.activeMetric] : [],
            )
    const showStockPrice = rawMetrics.includes('stockPrice')
    const metrics = rawMetrics
      .filter((metricId) => metricId !== 'stockPrice')
      .map((metricId) => CHARTING_TO_SPEC_METRIC_MAP[metricId] ?? metricId)

    if (metrics.length === 0) return null

    const titleText =
      typeof fundState.chartTitleText === 'string'
        ? fundState.chartTitleText.trim()
        : ''

    const autoTitle = `${primarySymbol} ${metrics.map((m) => SPEC_METRIC_LABELS[m] ?? m).join(' & ')}`

    return {
      stocks: [primarySymbol, ...compareSymbols],
      metrics,
      periodType: fundState.period === 'quarter' ? 'quarterly' : 'annual',
      minYear: normalizeFiniteInteger(fundState.minYear),
      maxYear: normalizeFiniteInteger(fundState.maxYear),
      showStockPrice,
      chartType: resolveFundamentalsChartTypeFromState(fundState, rawMetrics),
      showLabels: fundState.showLabels !== false,
      stacked: fundState.stacked === true,
      indexToZero: fundState.indexed === true,
      title:
        fundState.chartTitleCustomized === true && titleText
          ? titleText
          : autoTitle,
      subtitle: fallbackSpec?.subtitle,
      colors: normalizeMetricColorMap(fundState.metricColors),
    }
  } catch {
    return null
  }
}

export {
  DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID,
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  getDashboardChartOfTheDaySpec,
  type DashboardChartOfTheDayChartSpec,
  type DashboardChartOfTheDaySelection,
}
