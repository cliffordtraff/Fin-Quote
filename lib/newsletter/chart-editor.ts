import { parseDashboardChartOfTheDayEditorSpecFromFundState } from '@/lib/dashboard/chart-of-the-day-editor'
import {
  NEWSLETTER_PRICE_CHART_TYPES,
  normalizeNewsletterPriceStateSnapshot,
  normalizeNewsletterPriceChartType,
  normalizeNewsletterPriceInterval,
  normalizeNewsletterPriceRange,
} from './chart-spec'
import {
  DEFAULT_EDITOR_CHART_RENDER_HEIGHT,
  DEFAULT_EDITOR_CHART_RENDER_WIDTH,
} from './render-dimensions'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterPriceChartType,
  PriceNewsletterChartSpec,
} from './types'
import { resolveChartingPlatformNewsletterChart } from './charting-platform-export'

// Placeholder origin so the resolved URL is parseable; we strip the origin below
// and return a relative path. The app proxies /tos/* to the real charting host
// via next.config.js rewrites so the iframe is same-origin.
const CHARTING_PROXY_BASE_URL = 'https://charting-proxy.theintraday.invalid'
const NEWSLETTER_EDITOR_TARGET_WIDTH = DEFAULT_EDITOR_CHART_RENDER_WIDTH
const NEWSLETTER_EDITOR_TARGET_HEIGHT = DEFAULT_EDITOR_CHART_RENDER_HEIGHT

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

  const url = new URL(resolved.interactiveUrl)
  url.searchParams.set('fundState', encodeBase64UrlJson(editorFundState))
  url.searchParams.set('embed', 'true')
  url.searchParams.set('newsletterEditor', '1')
  url.searchParams.set('newsletterEditorTarget', 'fundamentals')
  url.searchParams.set('newsletterEditorWidth', String(NEWSLETTER_EDITOR_TARGET_WIDTH))
  url.searchParams.set('newsletterEditorHeight', String(NEWSLETTER_EDITOR_TARGET_HEIGHT))

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
}

export function resolveNewsletterPriceChartEditor(
  spec: PriceNewsletterChartSpec,
  options: { theme?: 'light' | 'dark' } = {},
): NewsletterPriceChartEditorResolution {
  const resolved = resolveChartingPlatformNewsletterChart(spec, {
    chartBaseUrl: CHARTING_PROXY_BASE_URL,
    theme: options.theme ?? 'light',
  })

  const url = new URL(resolved.interactiveUrl)
  url.searchParams.set('embed', 'true')
  url.searchParams.set('canvasEditor', '1')
  url.searchParams.set('newsletterEditor', '1')
  url.searchParams.set('newsletterEditorTarget', 'price')
  url.searchParams.set('newsletterEditorWidth', String(NEWSLETTER_EDITOR_TARGET_WIDTH))
  url.searchParams.set('newsletterEditorHeight', String(NEWSLETTER_EDITOR_TARGET_HEIGHT))

  const priceState = normalizeNewsletterPriceStateSnapshot(spec.priceState, {
    symbol: resolved.ticker,
    range: spec.range,
    interval: spec.interval,
    chartType: spec.chartType,
  })
  if (priceState) {
    url.searchParams.set('priceState', encodeBase64UrlJson(priceState))
  }

  return {
    iframePath: `${url.pathname}${url.search}`,
    symbol: resolved.ticker,
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
