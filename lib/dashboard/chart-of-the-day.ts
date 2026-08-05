import {
  DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID,
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  getDashboardChartOfTheDaySpec,
  normalizeDashboardChartOfTheDaySelection,
  type DashboardChartOfTheDayChartSpec,
  type DashboardChartOfTheDaySelection,
} from './chart-of-the-day-spec'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { toSpecMetricId } from '@/lib/charting-metric-bridge'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import {
  getDefaultPublicChartingBaseUrlForHost,
  resolveChartingPlatformDashboardFundamentalsSurfacePath,
  resolveChartingPlatformNewsletterChart,
} from '@/lib/newsletter/charting-platform-export'
import { getChartingPlatformRenderUrl } from '@/lib/newsletter/capture'
import type { NewsletterChartSpec } from '@/lib/newsletter/types'
import type { ChartExportSpec } from '@/types/chart-export'
import { getDashboardChartOfTheDaySetting } from './chart-of-the-day-settings'

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

export interface DashboardChartOfTheDayIframeUrls {
  light: string
  dark: string
}

export interface DashboardChartOfTheDayFallbackImage {
  absolutePath: string
  publicUrl: string
}

export interface DashboardChartOfTheDayFallbackPayload {
  buffer: Buffer
  contentType: 'image/png'
}

const CHARTING_PROXY_BASE_URL = 'https://charting-proxy.theintraday.invalid'

function normalizeTicker(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeBase64UrlJson<T>(value: string): T {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as T
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
    const mappedMetricId = toSpecMetricId(metricId)
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

function resolveDashboardChartOfTheDayFromSpec(
  options: ResolveDashboardChartOfTheDayOptions,
  spec: DashboardChartOfTheDayChartSpec,
  metadata: {
    symbol?: string
    templateId?: string
  } = {},
): ResolvedDashboardChartOfTheDay {
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
  const dashboardFundState = {
    ...((resolvedChart.captureSpec.fundState as Record<string, unknown> | undefined) ?? {}),
    sliderOnlyMode: true,
  }
  const captureSpec = {
    ...resolvedChart.captureSpec,
    fundState: dashboardFundState,
  }

  return {
    label: DASHBOARD_CHART_OF_THE_DAY_LABEL,
    symbol: metadata.symbol ?? spec.stocks[0] ?? DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    templateId:
      metadata.templateId ?? DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID,
    spec,
    chartBaseUrl,
    renderUrl: getChartingPlatformRenderUrl(chartBaseUrl),
    captureUrl: resolvedChart.captureUrl,
    interactiveUrl: buildDashboardInteractiveUrl(
      resolvedChart.interactiveUrl,
      dashboardFundState,
    ),
    captureSpec,
  }
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

    const compareSymbols = normalizeTickerList(fundState.compareSymbols)
      .filter((symbol) => symbol !== primarySymbol)
    const visibleMetrics = normalizeMetricList(fundState.visibleMetrics)
    const addedMetrics = normalizeMetricList(fundState.addedMetrics)
    const rawMetrics = visibleMetrics.length > 0
      ? visibleMetrics
      : addedMetrics.length > 0
        ? addedMetrics
        : normalizeMetricList(
            typeof fundState.activeMetric === 'string' ? [fundState.activeMetric] : [],
          )
    const showStockPrice = rawMetrics.includes('stockPrice')
    const metrics = rawMetrics
      .filter((metricId) => metricId !== 'stockPrice')
      .map((metricId) => toSpecMetricId(metricId))

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

export function resolveDashboardChartOfTheDay(
  options: ResolveDashboardChartOfTheDayOptions = {},
  selection: DashboardChartOfTheDaySelection = DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
): ResolvedDashboardChartOfTheDay {
  const normalizedSelection = normalizeDashboardChartOfTheDaySelection(selection)
  const spec = getDashboardChartOfTheDaySpec(normalizedSelection)
  return resolveDashboardChartOfTheDayFromSpec(
    options,
    spec as DashboardChartOfTheDayChartSpec,
    {
      symbol: normalizedSelection.ticker,
      templateId: normalizedSelection.templateId,
    },
  )
}

export async function resolveCurrentDashboardChartOfTheDay(
  options: ResolveDashboardChartOfTheDayOptions = {},
): Promise<ResolvedDashboardChartOfTheDay> {
  const setting = await getDashboardChartOfTheDaySetting()
  return resolveDashboardChartOfTheDayFromSpec(options, setting.chartSpec, {
    symbol:
      setting.chartSpec.stocks[0] ??
      setting.selection?.ticker ??
      DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    templateId:
      setting.source === 'template'
        ? (setting.selection?.templateId ?? DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID)
        : DASHBOARD_CHART_OF_THE_DAY_CUSTOM_TEMPLATE_ID,
  })
}

export async function loadDashboardChartOfTheDayEmbedSpec(): Promise<NewsletterChartSpec> {
  const setting = await getDashboardChartOfTheDaySetting()
  return setting.chartSpec
}

export function resolveDashboardChartOfTheDayIframeUrls(
  options: Omit<ResolveDashboardChartOfTheDayOptions, 'theme'> = {},
  selection: DashboardChartOfTheDaySelection = DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
): DashboardChartOfTheDayIframeUrls {
  const spec = getDashboardChartOfTheDaySpec(selection)

  if (isPriceNewsletterChartSpec(spec)) {
    throw new Error('Dashboard chart of the day must resolve to a fundamentals export spec')
  }

  const buildIframePath = (theme: 'light' | 'dark') =>
    resolveChartingPlatformDashboardFundamentalsSurfacePath(spec, {
      width: DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
      height: DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
      theme,
    })

  return {
    light: buildIframePath('light'),
    dark: buildIframePath('dark'),
  }
}

export async function loadDashboardChartOfTheDayIframeUrls(
  options: Omit<ResolveDashboardChartOfTheDayOptions, 'theme'> = {},
): Promise<DashboardChartOfTheDayIframeUrls> {
  const setting = await getDashboardChartOfTheDaySetting()

  if (isPriceNewsletterChartSpec(setting.chartSpec)) {
    throw new Error('Dashboard chart of the day must resolve to a fundamentals export spec')
  }

  const buildIframePath = (theme: 'light' | 'dark') =>
    resolveChartingPlatformDashboardFundamentalsSurfacePath(setting.chartSpec, {
      width: DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
      height: DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
      theme,
    })

  return {
    light: buildIframePath('light'),
    dark: buildIframePath('dark'),
  }
}

export function findDashboardChartOfTheDayFallbackImage():
  | DashboardChartOfTheDayFallbackImage
  | null {
  return findDashboardChartOfTheDayFallbackImageForSelection(
    DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  )
}

export function findDashboardChartOfTheDayFallbackImageForSelection(
  selection: DashboardChartOfTheDaySelection,
): DashboardChartOfTheDayFallbackImage | null {
  const normalizedSelection = normalizeDashboardChartOfTheDaySelection(selection)
  const chartDir = resolve(process.cwd(), '.newsletter-output')
  const prefix = `${normalizedSelection.ticker}_${normalizedSelection.templateId}_`

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

export async function loadDashboardChartOfTheDayFallbackImage(
  theme: 'light' | 'dark' = 'light',
  selection: DashboardChartOfTheDaySelection = DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
): Promise<DashboardChartOfTheDayFallbackPayload | null> {
  const fallbackImage = findDashboardChartOfTheDayFallbackImageForSelection(selection)
  if (!fallbackImage) return null

  const rawBuffer = readFileSync(fallbackImage.absolutePath)

  if (theme !== 'dark') {
    return {
      buffer: rawBuffer,
      contentType: 'image/png',
    }
  }

  return {
    buffer: await transformDashboardChartImageForDarkTheme(rawBuffer),
    contentType: 'image/png',
  }
}

export async function transformDashboardChartImageForDarkTheme(input: Buffer): Promise<Buffer> {
  const sharpModule = await import('sharp')
  const sharp = sharpModule.default
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const output = Buffer.from(data)
  const background = { r: 30, g: 41, b: 59 }
  const grid = { r: 40, g: 50, b: 65 }
  const text = { r: 226, g: 232, b: 240 }

  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels
    const alpha = output[offset + 3]
    if (alpha === 0) continue

    const r = output[offset]
    const g = output[offset + 1]
    const b = output[offset + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

    if (luminance >= 246 && saturation <= 0.08) {
      output[offset] = background.r
      output[offset + 1] = background.g
      output[offset + 2] = background.b
      continue
    }

    if (luminance >= 224 && saturation <= 0.1) {
      output[offset] = Math.round(r * 0.16 + grid.r * 0.84)
      output[offset + 1] = Math.round(g * 0.16 + grid.g * 0.84)
      output[offset + 2] = Math.round(b * 0.16 + grid.b * 0.84)
      continue
    }

    if (luminance <= 178 && saturation <= 0.18) {
      const mix = Math.min(0.8, 0.34 + (178 - luminance) / 240)
      output[offset] = Math.round(r * (1 - mix) + text.r * mix)
      output[offset + 1] = Math.round(g * (1 - mix) + text.g * mix)
      output[offset + 2] = Math.round(b * (1 - mix) + text.b * mix)
    }
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .sharpen({ sigma: 0.25, m1: 0.25, m2: 0.6 })
    .png()
    .toBuffer()
}

export {
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_LABEL,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  getDashboardChartOfTheDaySpec,
  type DashboardChartOfTheDaySelection,
}
