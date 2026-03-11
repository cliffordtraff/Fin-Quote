/**
 * Provider factory — returns the active MarketDataProvider based on env config.
 *
 * Usage:
 *   import { getProvider } from '@/lib/providers'
 *   const provider = getProvider()
 *   const quote = await provider.getQuote('AAPL')
 *
 * Set `DATA_PROVIDER=massive` in .env.local to switch from FMP to Massive.
 * Default is `fmp` (no change from current behavior).
 */

import type { MarketDataProvider } from './types'
import { FMPProvider } from './fmp'
import { MassiveProvider } from './massive'

let cachedProvider: MarketDataProvider | null = null
let cachedProviderName: string | null = null

/**
 * Returns the active MarketDataProvider instance.
 *
 * The provider is selected by the `DATA_PROVIDER` env var:
 * - `"fmp"` (default) — uses FMP (Financial Modeling Prep)
 * - `"massive"` — uses Massive (Polygon.io)
 *
 * The instance is cached for the lifetime of the process so
 * repeated calls don't re-instantiate.
 */
export function getProvider(): MarketDataProvider {
  const providerName = process.env.DATA_PROVIDER ?? 'fmp'

  // Return cached instance if the env hasn't changed
  if (cachedProvider && cachedProviderName === providerName) {
    return cachedProvider
  }

  switch (providerName) {
    case 'massive':
      cachedProvider = new MassiveProvider()
      break
    case 'fmp':
    default:
      cachedProvider = new FMPProvider()
      break
  }

  cachedProviderName = providerName
  return cachedProvider
}

// Re-export types for convenience
export type { MarketDataProvider, ProviderQuote, ProviderCandle, ProviderNews, CandleTimespan } from './types'
