/**
 * iXBRL Company Mappings Index
 *
 * This module exports XBRL segment mappings for supported companies.
 * Each company has its own mapping file that defines:
 * - Which XBRL axes are used for product/geographic dimensions
 * - How to map XBRL member names to display names
 * - Fiscal year end month for period calculations
 */

export * from './aapl'
export * from './googl'

import { AAPL_MAPPINGS, type CompanyMappings } from './aapl'
import { GOOGL_MAPPINGS } from './googl'

/**
 * Registry of all supported company mappings
 */
export const COMPANY_MAPPINGS: Record<string, CompanyMappings> = {
  AAPL: AAPL_MAPPINGS,
  GOOGL: GOOGL_MAPPINGS,
  // Future: Add more companies here
  // MSFT: MSFT_MAPPINGS,
}

/**
 * Get mappings for a company by ticker
 */
export function getMappingsForTicker(ticker: string): CompanyMappings | null {
  return COMPANY_MAPPINGS[ticker.toUpperCase()] ?? null
}

/**
 * Get list of supported tickers
 */
export function getSupportedTickers(): string[] {
  return Object.keys(COMPANY_MAPPINGS)
}

/**
 * Check if a ticker is supported
 */
export function isTickerSupported(ticker: string): boolean {
  return ticker.toUpperCase() in COMPANY_MAPPINGS
}

/**
 * Get segment display name from XBRL member for a specific company
 */
export function getSegmentDisplayNameForTicker(ticker: string, xbrlMember: string): string | null {
  const mappings = getMappingsForTicker(ticker)
  if (!mappings) return null
  const mapping = mappings.members[xbrlMember]
  return mapping?.displayName ?? null
}

/**
 * Get segment type from XBRL axis for a specific company
 *
 * For GOOGL:
 * - us-gaap:StatementBusinessSegmentsAxis → product (business segments)
 * - srt:ProductOrServiceAxis → product (product breakdown)
 * - srt:StatementGeographicalAxis → geographic
 *
 * For AAPL:
 * - srt:ProductOrServiceAxis → product
 * - us-gaap:StatementBusinessSegmentsAxis → geographic
 * - srt:StatementGeographicalAxis → country
 */
export function getSegmentTypeFromAxisForTicker(
  ticker: string,
  axis: string
): 'product' | 'geographic' | 'country' | 'product_type' | null {
  const mappings = getMappingsForTicker(ticker)
  if (!mappings) return null

  if (axis === mappings.axes.product) {
    return 'product'
  }
  if (axis === mappings.axes.geographic) {
    return 'geographic'
  }
  if (axis === mappings.axes.country) {
    return 'country'
  }

  // For GOOGL, also check the business segment axis which maps to 'product' type
  if (ticker.toUpperCase() === 'GOOGL' && axis === 'us-gaap:StatementBusinessSegmentsAxis') {
    return 'product'
  }

  return null
}
