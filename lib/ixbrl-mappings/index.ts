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

import { AAPL_MAPPINGS, type CompanyMappings } from './aapl'

/**
 * Registry of all supported company mappings
 */
export const COMPANY_MAPPINGS: Record<string, CompanyMappings> = {
  AAPL: AAPL_MAPPINGS,
  // Future: Add more companies here
  // MSFT: MSFT_MAPPINGS,
  // GOOGL: GOOGL_MAPPINGS,
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
