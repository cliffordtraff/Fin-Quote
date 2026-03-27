import type {
  NewsletterChartSpec,
  NewsletterPriceChartType,
  NewsletterPriceInterval,
  NewsletterPriceRange,
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
