import type { ChartExportSpec } from '@/types/chart-export'

/**
 * Encode a ChartExportSpec as a base64 string for use in URL params.
 *
 * Usage:
 *   const url = buildExportUrl({ stocks: ['AAPL'], metrics: ['revenue'] })
 *   // → "/charts/export?spec=eyJzdG9ja3Mi..."
 */
export function encodeChartSpec(spec: ChartExportSpec): string {
  const json = JSON.stringify(spec)
  if (typeof window !== 'undefined') {
    return btoa(json)
  }
  return Buffer.from(json).toString('base64')
}

/**
 * Decode a base64-encoded ChartExportSpec from a URL param.
 * Returns null if the input is invalid.
 */
export function decodeChartSpec(encoded: string): ChartExportSpec | null {
  try {
    let json: string
    if (typeof window !== 'undefined') {
      json = atob(encoded)
    } else {
      json = Buffer.from(encoded, 'base64').toString('utf-8')
    }
    const parsed = JSON.parse(json)
    // Basic validation: must have stocks and metrics arrays
    if (!Array.isArray(parsed.stocks) || !Array.isArray(parsed.metrics)) {
      return null
    }
    return parsed as ChartExportSpec
  } catch {
    return null
  }
}

/**
 * Build an export URL from a ChartExportSpec.
 *
 * Examples:
 *   buildExportUrl({ stocks: ['AAPL'], metrics: ['revenue', 'net_income'] })
 *   → "/charts/export?spec=eyJzdG9ja3MiOlsiQUFQTCJdLCJtZXRyaWNzIjpbInJldmVudWUiLCJuZXRfaW5jb21lIl19"
 *
 *   buildExportUrl(spec, 'https://theintraday.com')
 *   → "https://theintraday.com/charts/export?spec=..."
 */
export function buildExportUrl(spec: ChartExportSpec, baseUrl = ''): string {
  const encoded = encodeChartSpec(spec)
  return `${baseUrl}/charts/export?spec=${encoded}`
}

/**
 * Parse a ChartExportSpec from URL search params.
 * Supports two formats:
 *   1. Base64-encoded spec param: ?spec=eyJzdG9ja3Mi...
 *   2. Individual params: ?stocks=AAPL&metrics=revenue,net_income&title=My+Chart
 */
export function parseSpecFromParams(searchParams: URLSearchParams): ChartExportSpec | null {
  // Try base64 spec param first
  const encoded = searchParams.get('spec')
  if (encoded) {
    return decodeChartSpec(encoded)
  }

  // Fallback: parse individual query params
  const stocks = searchParams.get('stocks')?.split(',').filter(Boolean)
  const metrics = searchParams.get('metrics')?.split(',').filter(Boolean)
  if (!stocks?.length || !metrics?.length) return null

  return {
    stocks,
    metrics,
    periodType: (searchParams.get('period') as 'annual' | 'quarterly') || undefined,
    minYear: searchParams.get('minYear') ? Number(searchParams.get('minYear')) : undefined,
    maxYear: searchParams.get('maxYear') ? Number(searchParams.get('maxYear')) : undefined,
    showStockPrice: searchParams.get('showPrice') === 'true',
    chartType: (searchParams.get('chartType') as 'bar' | 'line' | 'area') || undefined,
    showLabels: searchParams.get('showLabels') !== 'false',
    stacked: searchParams.get('stacked') === 'true',
    indexToZero: searchParams.get('indexToZero') === 'true',
    title: searchParams.get('title') || undefined,
    subtitle: searchParams.get('subtitle') || undefined,
  }
}
