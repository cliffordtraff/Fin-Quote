import { parseDashboardChartOfTheDayEditorSpecFromFundState } from '@/lib/dashboard/chart-of-the-day-editor'
import {
  NEWSLETTER_PRICE_CHART_TYPES,
  normalizeNewsletterPriceStateSnapshot,
  normalizeNewsletterPriceChartType,
  normalizeNewsletterPriceInterval,
  normalizeNewsletterPriceRange,
} from './chart-spec'
import { getNewsletterChartRenderDimensions } from './render-dimensions'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterPriceChartType,
  PriceChartExportSpec,
  PriceNewsletterChartSpec,
} from './types'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'

// Placeholder origin so the resolved URL is parseable; we strip the origin below
// and return a relative path. The app proxies /tos/* to the real charting host
// via next.config.js rewrites so the iframe is same-origin.
const CHARTING_PROXY_BASE_URL = 'https://charting-proxy.theintraday.invalid'

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
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export interface NewsletterChartEditorResolution {
  iframePath: string
  fundState: Record<string, unknown>
  symbol: string
}

export function resolveNewsletterChartEditor(
  spec: FundamentalsNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' } = {},
): NewsletterChartEditorResolution {
  const resolved = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl: CHARTING_PROXY_BASE_URL,
    theme: options.theme ?? 'light',
  })

  const captureFundState =
    (resolved.captureSpec as { fundState?: Record<string, unknown> }).fundState ?? {}

  const editorFundState = {
    ...captureFundState,
    sliderOnlyMode: false,
    showTooltip: true,
    hoverFocusEnabled: true,
  }

  const dimensions = getNewsletterChartRenderDimensions(spec)
  const url = new URL(resolved.interactiveUrl)
  url.searchParams.set('fundState', encodeBase64UrlJson(editorFundState))
  url.searchParams.set('embed', 'true')
  url.searchParams.set('newsletterEditor', '1')
  url.searchParams.set('newsletterEditorTarget', 'fundamentals')
  url.searchParams.set('newsletterEditorWidth', String(dimensions.width))
  url.searchParams.set('newsletterEditorHeight', String(dimensions.height))

  return {
    iframePath: `${url.pathname}${url.search}`,
    fundState: editorFundState,
    symbol: resolved.ticker,
  }
}

export function parseFundamentalsNewsletterChartSpecFromFundState(
  fundState: Record<string, unknown>,
  symbol: string,
  fallback: FundamentalsNewsletterChartSpec,
): FundamentalsNewsletterChartSpec | null {
  const parsed = parseDashboardChartOfTheDayEditorSpecFromFundState(
    fundState,
    symbol,
    fallback,
  )
  if (!parsed) return null
  return { ...parsed, mode: 'fundamentals' }
}

export interface NewsletterPriceChartEditorResolution {
  iframePath: string
  symbol: string
  priceState: Record<string, unknown>
}

function buildEditorPriceState(
  spec: PriceNewsletterChartSpec,
  symbol: string,
): Record<string, unknown> {
  return normalizeNewsletterPriceStateSnapshot(spec.priceState, {
    symbol,
    range: spec.range,
    interval: spec.interval,
    chartType: spec.chartType,
  }) ?? {
    symbol,
    ticker: symbol,
    range: spec.range,
    interval: spec.interval,
    chartType: spec.chartType,
  }
}

// ---------------------------------------------------------------------------
// Standalone /export-editor surface (charting-platform v2)
// ---------------------------------------------------------------------------
//
// The charting platform's embedded export editor lives at /export-editor (see
// `next.config.js` rewrites). It mounts a sidebar + preview iframe + spec
// emitter. Parent (this app) does:
//
//   1. Open <iframe src="/export-editor">
//   2. Wait for `{ type: 'export-editor:ready' }` from the iframe
//   3. Post `{ type: 'export-editor:init', baseSpec }` with the seed below
//   4. Listen for `{ type: 'export-editor:spec-changed', spec }` and store
//      the latest spec into the newsletter draft (PriceNewsletterChartSpec
//      .chartExportSpec)
//   5. On render, POST that spec to /api/chart-export/render to get a PNG

export interface NewsletterPriceExportEditorResolution {
  /** Iframe src (relative — Fin Quote proxies /export-editor to the charting host). */
  iframePath: string
  /** Resolved ticker. */
  symbol: string
  /** Seed spec posted via `export-editor:init` after the editor emits ready. */
  baseSpec: PriceChartExportSpec
}

const DAY_MS = 86_400_000
const TRADING_DAYS_PER_WEEK = 5
const CALENDAR_DAYS_PER_TRADING_DAY = 7 / TRADING_DAYS_PER_WEEK
const US_MARKET_MINUTES_PER_DAY = 390
const NEWSLETTER_PRICE_RIGHT_MARGIN_BARS = 10
const NEWSLETTER_PRICE_EXPORT_SCALE = 3
const NEWSLETTER_PRICE_TITLE_SIZE = 28
const NEWSLETTER_PRICE_AXIS_LABEL_SIZE = 9
const NEWSLETTER_PRICE_GRID_OPACITY = 0.12

function rangeToApproxMs(range: string | undefined): number {
  switch (range) {
    case '1d': return DAY_MS
    case '5d': return 7 * DAY_MS
    case '1m': return 31 * DAY_MS
    case '3m': return 93 * DAY_MS
    case '6m': return 184 * DAY_MS
    case '1y': return 366 * DAY_MS
    case '2y': return 731 * DAY_MS
    case '5y': return 1827 * DAY_MS
    default: return 184 * DAY_MS
  }
}

function approximateTradingDaysForRange(range: string | undefined): number {
  switch (range) {
    case '1d': return 1
    case '5d': return 5
    case '1m': return 22
    case '3m': return 66
    case '6m': return 126
    case '1y': return 252
    case '2y': return 504
    case '5y': return 1260
    default: return 126
  }
}

function parseIntervalToken(interval: string | undefined): {
  amount: number
  unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month'
} {
  const token = String(interval || '').trim().toLowerCase()
  if (token === 'd' || token === '1d' || token === 'day') {
    return { amount: 1, unit: 'day' }
  }
  if (token === 'w' || token === '1w' || token === 'week') {
    return { amount: 1, unit: 'week' }
  }
  if (token === 'm' || token === '1mo' || token === 'month') {
    return { amount: 1, unit: 'month' }
  }

  const match = /^(\d+)\s*(sec|min|hour|day|week|mo|month)s?$/.exec(token)
  if (!match) return { amount: 1, unit: 'day' }
  const amount = Math.max(1, Number.parseInt(match[1] || '1', 10))
  const rawUnit = match[2]
  if (rawUnit === 'sec') return { amount, unit: 'second' }
  if (rawUnit === 'min') return { amount, unit: 'minute' }
  if (rawUnit === 'hour') return { amount, unit: 'hour' }
  if (rawUnit === 'week') return { amount, unit: 'week' }
  if (rawUnit === 'mo' || rawUnit === 'month') return { amount, unit: 'month' }
  return { amount, unit: 'day' }
}

function approximateBarsPerTradingDay(interval: string | undefined): number {
  const parsed = parseIntervalToken(interval)
  switch (parsed.unit) {
    case 'second':
      return (US_MARKET_MINUTES_PER_DAY * 60) / parsed.amount
    case 'minute':
      return US_MARKET_MINUTES_PER_DAY / parsed.amount
    case 'hour':
      return Math.max(1, 6.5 / parsed.amount)
    case 'day':
      return 1 / parsed.amount
    case 'week':
      return 1 / (TRADING_DAYS_PER_WEEK * parsed.amount)
    case 'month':
      return 1 / (21 * parsed.amount)
  }
}

function approximateVisibleBarsForRange(
  range: string | undefined,
  interval: string | undefined,
): number {
  const tradingDays = approximateTradingDaysForRange(range)
  const barsPerTradingDay = approximateBarsPerTradingDay(interval)
  return Math.max(1, Math.round(tradingDays * barsPerTradingDay))
}

function newsletterPriceLookbackBars(
  range: string | undefined,
  requestedVisibleBars: number,
): number {
  const baseBars = Math.max(1, Math.floor(requestedVisibleBars || 0))
  switch (range) {
    case '1d':
      return Math.max(24, Math.round(baseBars * 3.5))
    case '5d':
      return Math.max(20, Math.round(baseBars * 3))
    case '1m':
      return Math.max(48, Math.round(baseBars * 3.5))
    case '3m':
      return Math.max(72, Math.round(baseBars * 1.8))
    case '6m':
      return Math.max(96, Math.round(baseBars * 1.1))
    case '1y':
      return Math.max(156, Math.round(baseBars * 0.8))
    case '2y':
    case '5y':
      return Math.max(208, Math.round(baseBars * 0.45))
    default:
      return Math.max(40, Math.round(baseBars))
  }
}

function approximateCalendarMsForBars(
  barCount: number,
  interval: string | undefined,
): number {
  const barsPerTradingDay = approximateBarsPerTradingDay(interval)
  if (barsPerTradingDay > 0) {
    const tradingDays = Math.ceil(Math.max(0, barCount) / barsPerTradingDay)
    return Math.ceil(tradingDays * CALENDAR_DAYS_PER_TRADING_DAY) * DAY_MS
  }
  return Math.max(0, barCount) * DAY_MS
}

function warmupPaddingDaysForInterval(interval: string | undefined): number {
  const parsed = parseIntervalToken(interval)
  switch (parsed.unit) {
    case 'second':
      return 1
    case 'minute':
      if (parsed.amount <= 2) return 14
      if (parsed.amount <= 5) return 21
      if (parsed.amount <= 15) return 45
      if (parsed.amount <= 30) return 90
      if (parsed.amount <= 60) return 180
      return 365
    case 'hour':
      return parsed.amount <= 1 ? 180 : 365
    case 'day':
      return parsed.amount === 1 ? 365 : 730
    case 'week':
      return 730
    case 'month':
      return 1825
  }
}

function readTimeRange(value: unknown): { startTime: number; endTime: number } | null {
  if (!value || typeof value !== 'object') return null
  const range = value as { startTime?: unknown; endTime?: unknown }
  const startTime = Number(range.startTime)
  const endTime = Number(range.endTime)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return null
  }
  return { startTime, endTime }
}

function buildDefaultPriceExportTimeRanges(
  range: string | undefined,
  interval: string | undefined,
): {
  viewportTimeRange: { startTime: number; endTime: number; visibleBars: number }
  dataTimeRange: { startTime: number; endTime: number }
} {
  const endTime = Date.now()
  const visibleRangeMs = rangeToApproxMs(range)
  const requestedVisibleBars = approximateVisibleBarsForRange(range, interval)
  const lookbackBars = newsletterPriceLookbackBars(range, requestedVisibleBars)
  const lookbackMs = approximateCalendarMsForBars(lookbackBars, interval)
  const visibleStartTime = Math.max(0, endTime - visibleRangeMs)
  const viewportStartTime = Math.max(0, visibleStartTime - lookbackMs)
  const warmupMs = warmupPaddingDaysForInterval(interval) * DAY_MS
  const dataStartTime = Math.max(0, visibleStartTime - warmupMs)

  return {
    viewportTimeRange: {
      startTime: viewportStartTime,
      endTime,
      visibleBars: requestedVisibleBars + lookbackBars + NEWSLETTER_PRICE_RIGHT_MARGIN_BARS,
    },
    dataTimeRange: {
      startTime: Math.min(dataStartTime, viewportStartTime),
      endTime,
    },
  }
}

function ensureDataRangeIncludesViewport(
  dataTimeRange: { startTime: number; endTime: number },
  viewportTimeRange: unknown,
): { startTime: number; endTime: number } {
  const viewport = readTimeRange(viewportTimeRange)
  if (!viewport) return dataTimeRange
  return {
    startTime: Math.min(dataTimeRange.startTime, viewport.startTime),
    endTime: Math.max(dataTimeRange.endTime, viewport.endTime),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatExportIntervalLabel(interval: string | undefined): string {
  const token = String(interval || '').trim()
  const lower = token.toLowerCase()
  if (!lower) return ''
  if (lower === 'd' || lower === '1d' || lower === 'day' || lower === '1day') {
    return 'Daily'
  }
  if (lower === 'w' || lower === '1w' || lower === 'week' || lower === '1week') {
    return 'Weekly'
  }
  if (lower === 'm' || lower === '1mo' || lower === 'month' || lower === '1month') {
    return 'Monthly'
  }
  const match = lower.match(/^([1-9]\d*)(sec|min|hour|day|week|month)$/)
  if (!match) return token
  const amount = Number(match[1])
  const unit = match[2]
  if (amount === 1 && unit === 'hour') return 'Hourly'
  if (amount === 1 && unit === 'day') return 'Daily'
  if (amount === 1 && unit === 'week') return 'Weekly'
  if (amount === 1 && unit === 'month') return 'Monthly'
  const unitLabel =
    unit === 'sec'
      ? 'Second'
      : unit === 'min'
        ? 'Minute'
        : unit.charAt(0).toUpperCase() + unit.slice(1)
  return `${amount} ${unitLabel}${amount === 1 ? '' : 's'}`
}

function defaultPriceExportTitle(symbol: string, interval: string | undefined): string {
  const intervalLabel = formatExportIntervalLabel(interval)
  return intervalLabel ? `${symbol} - ${intervalLabel}` : symbol
}

function hasExportLowerPane(source: PriceChartExportSpec): boolean {
  if (Array.isArray(source.lowerPanes) && source.lowerPanes.length > 0) {
    return true
  }
  if (!Array.isArray(source.indicators)) return false
  return source.indicators.some((indicator) => {
    if (!isRecord(indicator)) return false
    if (indicator.placement === 'lower') return true
    return (
      typeof indicator.paneId === 'string' &&
      indicator.paneId &&
      indicator.paneId !== 'price'
    )
  })
}

function completePriceExportSpec(
  source: PriceChartExportSpec,
  options: {
    symbol: string
    theme: 'light' | 'dark'
    displayWidth: number
    displayHeight: number
  },
): PriceChartExportSpec {
  const existingExportOptions = isRecord(source.exportOptions)
    ? source.exportOptions
    : {}
  const existingThemeOverrides = isRecord(source.themeOverrides)
    ? source.themeOverrides
    : {}
  const existingRenderProfileOverrides = isRecord(source.renderProfileOverrides)
    ? source.renderProfileOverrides
    : {}
  const chartTitle =
    typeof existingExportOptions.chartTitle === 'string' &&
    existingExportOptions.chartTitle.trim()
      ? existingExportOptions.chartTitle.trim()
      : typeof source.companyName === 'string' && source.companyName.trim()
        ? source.companyName.trim()
        : defaultPriceExportTitle(options.symbol, source.interval)
  const exportOptions = {
    displayWidth: options.displayWidth,
    displayHeight: options.displayHeight,
    exportScale: NEWSLETTER_PRICE_EXPORT_SCALE,
    visibleRange: 'current',
    pricePaneRatio: 0.76,
    chartTitle,
    includeDateRangeInTitle: false,
    titleSize: NEWSLETTER_PRICE_TITLE_SIZE,
    axisLabelSize: NEWSLETTER_PRICE_AXIS_LABEL_SIZE,
    priceAxisDensity: 1.5,
    gridDensity: 'subtle',
    gridDirection: 'both',
    gridOpacity: NEWSLETTER_PRICE_GRID_OPACITY,
    gridHorizontalColor: '#1F2937',
    gridVerticalColor: '#1F2937',
    gridHorizontalOpacity: NEWSLETTER_PRICE_GRID_OPACITY,
    gridVerticalOpacity: NEWSLETTER_PRICE_GRID_OPACITY,
    colorPreset: 'none',
    colorPresetTone: options.theme === 'dark' ? 'dark' : 'light',
    background: options.theme === 'dark' ? 'dark' : 'white',
    backgroundColor: options.theme === 'dark' ? '#000000' : '#FFFFFF',
    showTitle: true,
    showLegend: true,
    showLowerPane: hasExportLowerPane(source),
    showExtendedHours: true,
    showCurrentPriceLabel: true,
    showCurrentPriceLine: false,
    showWatermark: true,
    watermarkText: 'The Intraday',
    ...existingExportOptions,
  }
  const displayWidth = Number(exportOptions.displayWidth)
  const displayHeight = Number(exportOptions.displayHeight)
  const exportScale = Number(exportOptions.exportScale)
  const width =
    Number.isFinite(displayWidth) && Number.isFinite(exportScale)
      ? Math.round(displayWidth * exportScale)
      : source.width
  const height =
    Number.isFinite(displayHeight) && Number.isFinite(exportScale)
      ? Math.round(displayHeight * exportScale)
      : source.height
  return {
    ...source,
    theme: options.theme,
    width,
    height,
    companyName: chartTitle,
    renderProfile: source.renderProfile || 'newsletter',
    lowerPanes: Array.isArray(source.lowerPanes) ? source.lowerPanes : [],
    indicators: Array.isArray(source.indicators) ? source.indicators : [],
    themeOverrides: {
      bg: options.theme === 'dark' ? '#000000' : '#FFFFFF',
      axisBg: options.theme === 'dark' ? '#000000' : '#FFFFFF',
      axisBorder: 'rgba(31, 41, 55, 0.12)',
      axisBorderWidth: 0.5,
      priceAxisBorder: 'rgba(31, 41, 55, 0.12)',
      priceAxisBorderWidth: 0.5,
      grid: 'rgba(31, 41, 55, 1.000)',
      gridHorizontal: 'rgba(31, 41, 55, 1.000)',
      gridVertical: 'rgba(31, 41, 55, 1.000)',
      fontSizeHeader: NEWSLETTER_PRICE_TITLE_SIZE,
      fontSizeTick: NEWSLETTER_PRICE_AXIS_LABEL_SIZE,
      fontSizeTimeAxis: NEWSLETTER_PRICE_AXIS_LABEL_SIZE,
      fontSizeStudy: 13,
      priceHeaderDisplayMode: 'company-only',
      ...existingThemeOverrides,
    },
    gridVisible: source.gridVisible ?? true,
    gridHorizontal: source.gridHorizontal ?? true,
    gridVertical: source.gridVertical ?? true,
    gridOpacity:
      typeof source.gridOpacity === 'number'
        ? source.gridOpacity
        : NEWSLETTER_PRICE_GRID_OPACITY,
    renderProfileOverrides: {
      appendTickerToTitle: false,
      hideIndicatorLegend: false,
      hideVolume: false,
      hideLastPriceBadge: false,
      showLastPriceLine: false,
      ...existingRenderProfileOverrides,
    },
    exportOptions,
  }
}

export function buildPriceExportEditorBaseSpec(
  spec: PriceNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' },
): PriceChartExportSpec {
  const dimensions = getNewsletterChartRenderDimensions(spec)
  const symbol = (spec.symbol || '').trim().toUpperCase()
  if (!symbol) {
    throw new Error('Price newsletter chart spec is missing a symbol')
  }
  const theme = options.theme ?? 'light'
  // If a prior session already saved a chartExportSpec on this block, prefer
  // that as the editor's starting point so user edits round-trip. Backfill
  // missing render defaults so older lightweight specs regenerate the same
  // high-resolution image that the export editor previews.
  const persisted = spec.chartExportSpec
  if (persisted && typeof persisted === 'object') {
    const hasViewport =
      persisted.viewportTimeRange != null &&
      typeof persisted.viewportTimeRange === 'object'
    const hasDataRange =
      persisted.dataTimeRange != null &&
      typeof persisted.dataTimeRange === 'object'
    const fallbackRange =
      typeof persisted.range === 'string' && persisted.range
        ? persisted.range
        : spec.range
    const fallbackTimeRanges = buildDefaultPriceExportTimeRanges(
      fallbackRange,
      typeof persisted.interval === 'string' && persisted.interval
        ? persisted.interval
        : spec.interval,
    )
    const viewportTimeRange = hasViewport
      ? persisted.viewportTimeRange
      : fallbackTimeRanges.viewportTimeRange
    return completePriceExportSpec(
      {
        ...persisted,
        viewportTimeRange,
        dataTimeRange: hasDataRange
          ? persisted.dataTimeRange
          : ensureDataRangeIncludesViewport(
              fallbackTimeRanges.dataTimeRange,
              viewportTimeRange,
            ),
      },
      {
        symbol,
        theme: persisted.theme === 'dark' ? 'dark' : theme,
        displayWidth: dimensions.width,
        displayHeight: dimensions.height,
      },
    )
  }
  // Match the legacy /tos newsletter renderer: price charts show the requested
  // range plus contextual lookback bars. Without this, clicking an unsaved
  // draft chart opens the new export editor at a tighter zoom than the static
  // newsletter image that the user just clicked.
  const timeRanges = buildDefaultPriceExportTimeRanges(spec.range, spec.interval)
  return completePriceExportSpec(
    {
      symbol,
      interval: spec.interval,
      range: spec.range,
      chartType: spec.chartType,
      theme,
      renderProfile: 'newsletter',
      viewportTimeRange: timeRanges.viewportTimeRange,
      dataTimeRange: timeRanges.dataTimeRange,
    },
    {
      symbol,
      theme,
      displayWidth: dimensions.width,
      displayHeight: dimensions.height,
    },
  )
}

export function resolveNewsletterPriceExportEditor(
  spec: PriceNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' } = {},
): NewsletterPriceExportEditorResolution {
  const baseSpec = buildPriceExportEditorBaseSpec(spec, options)
  return {
    iframePath: '/export-editor',
    symbol: String(baseSpec.symbol).toUpperCase(),
    baseSpec,
  }
}

// ---------------------------------------------------------------------------
// Legacy /tos newsletterEditor surface — kept for fundamentals charts and
// any callers still on the v1 path. Newsletter draft UI should switch price
// blocks to resolveNewsletterPriceExportEditor above.
// ---------------------------------------------------------------------------

export function resolveNewsletterPriceChartEditor(
  spec: PriceNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' } = {},
): NewsletterPriceChartEditorResolution {
  const resolved = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl: CHARTING_PROXY_BASE_URL,
    theme: options.theme ?? 'light',
  })

  const dimensions = getNewsletterChartRenderDimensions(spec)
  const url = new URL(resolved.interactiveUrl)
  url.searchParams.set('embed', 'true')
  url.searchParams.set('canvasEditor', '1')
  url.searchParams.set('newsletterEditor', '1')
  url.searchParams.set('newsletterEditorTarget', 'price')
  url.searchParams.set('newsletterEditorWidth', String(dimensions.width))
  url.searchParams.set('newsletterEditorHeight', String(dimensions.height))

  const priceState = buildEditorPriceState(spec, resolved.ticker)
  url.searchParams.set('priceState', encodeBase64UrlJson(priceState))

  return {
    iframePath: `${url.pathname}${url.search}`,
    symbol: resolved.ticker,
    priceState,
  }
}

export function parsePriceNewsletterChartSpecFromState(
  priceState: Record<string, unknown>,
  symbol: string,
  fallback: PriceNewsletterChartSpec,
): PriceNewsletterChartSpec | null {
  const resolvedSymbol =
    (typeof symbol === 'string' && symbol.trim().toUpperCase()) ||
    (typeof priceState.symbol === 'string' && priceState.symbol.trim().toUpperCase()) ||
    (typeof priceState.ticker === 'string' && priceState.ticker.trim().toUpperCase()) ||
    fallback.symbol
  if (!resolvedSymbol) return null

  const chartTypeRaw =
    typeof priceState.chartType === 'string' ? priceState.chartType : undefined
  const chartType: NewsletterPriceChartType = NEWSLETTER_PRICE_CHART_TYPES.includes(
    chartTypeRaw as NewsletterPriceChartType,
  )
    ? (chartTypeRaw as NewsletterPriceChartType)
    : normalizeNewsletterPriceChartType(fallback.chartType)
  const range = normalizeNewsletterPriceRange(priceState.range, fallback.range)
  const interval = normalizeNewsletterPriceInterval(priceState.interval, fallback.interval)
  const nextPriceState = normalizeNewsletterPriceStateSnapshot(priceState, {
    symbol: resolvedSymbol,
    range,
    interval,
    chartType,
  })

  return {
    mode: 'price',
    symbol: resolvedSymbol,
    range,
    interval,
    chartType,
    priceState: nextPriceState,
    title: fallback.title,
    subtitle: fallback.subtitle,
  }
}
