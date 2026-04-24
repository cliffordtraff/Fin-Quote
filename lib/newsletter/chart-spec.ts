import type {
  NewsletterChartSpec,
  NewsletterPriceChartType,
  NewsletterPriceInterval,
  NewsletterPriceRange,
  NewsletterPriceStateSnapshot,
  PriceNewsletterChartSpec,
} from './types'

export const NEWSLETTER_PRICE_RANGES: NewsletterPriceRange[] = [
  '1d',
  '5d',
  '1m',
  '3m',
  '6m',
  '1y',
  '2y',
  '5y',
]

export const NEWSLETTER_PRICE_INTERVALS: NewsletterPriceInterval[] = [
  '1sec',
  '10sec',
  '1min',
  '2min',
  '5min',
  '15min',
  '30min',
  '1hour',
  '4hour',
  'D',
  'W',
  'M',
]

export const NEWSLETTER_PRICE_CHART_TYPES: NewsletterPriceChartType[] = [
  'candles',
  'hollow-candles',
  'ohlc-bars',
  'line',
  'heikin-ashi',
]

export function isPriceNewsletterChartSpec(
  spec: NewsletterChartSpec | Record<string, unknown> | null | undefined,
): spec is PriceNewsletterChartSpec {
  return spec != null && typeof spec === 'object' && 'mode' in spec && spec.mode === 'price'
}

export function normalizeNewsletterPriceRange(
  value: unknown,
  fallback: NewsletterPriceRange = '6m',
): NewsletterPriceRange {
  return NEWSLETTER_PRICE_RANGES.includes(value as NewsletterPriceRange)
    ? (value as NewsletterPriceRange)
    : fallback
}

export function normalizeNewsletterPriceInterval(
  value: unknown,
  fallback: NewsletterPriceInterval = 'D',
): NewsletterPriceInterval {
  return NEWSLETTER_PRICE_INTERVALS.includes(value as NewsletterPriceInterval)
    ? (value as NewsletterPriceInterval)
    : fallback
}

export function normalizeNewsletterPriceChartType(
  value: unknown,
  fallback: NewsletterPriceChartType = 'candles',
): NewsletterPriceChartType {
  return NEWSLETTER_PRICE_CHART_TYPES.includes(value as NewsletterPriceChartType)
    ? (value as NewsletterPriceChartType)
    : fallback
}

export function normalizeNewsletterPriceStateSnapshot(
  value: unknown,
  overrides: {
    symbol?: string
    range?: NewsletterPriceRange
    interval?: NewsletterPriceInterval
    chartType?: NewsletterPriceChartType
  } = {},
): NewsletterPriceStateSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  try {
    const snapshot = JSON.parse(JSON.stringify(value)) as NewsletterPriceStateSnapshot

    if (overrides.symbol) {
      snapshot.symbol = overrides.symbol
      snapshot.ticker = overrides.symbol
    }
    if (overrides.range) snapshot.range = overrides.range
    if (overrides.interval) snapshot.interval = overrides.interval
    if (overrides.chartType) snapshot.chartType = overrides.chartType

    return snapshot
  } catch (_err) {
    return undefined
  }
}
