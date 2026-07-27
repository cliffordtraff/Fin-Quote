import { getGeneratedStockWhyMovingData } from '@/lib/generated-stock-why-moving'
import {
  getStockWhyMovingData,
  peekStockWhyMovingCache,
} from '@/lib/stock-why-moving'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

/**
 * Read-only variant for cacheable page rendering.
 *
 * Stock pages should never turn a crawler or cache miss into a live Finviz
 * scrape. The explicit API route keeps the live-refresh behavior for callers
 * that need it.
 */
export async function getCachedStockWhyMovingDisplayData(
  symbol: string,
): Promise<StockWhyMovingResult | null> {
  const generated = await getGeneratedStockWhyMovingData(symbol)
  if (generated) return generated

  const cached = await peekStockWhyMovingCache(symbol)
  return cached.result
}

export async function getStockWhyMovingDisplayData(
  symbol: string,
  options?: { forceRefresh?: boolean; preferGenerated?: boolean },
): Promise<StockWhyMovingResult> {
  if (options?.preferGenerated !== false && !options?.forceRefresh) {
    const generated = await getGeneratedStockWhyMovingData(symbol)
    if (generated) return generated
  }

  return getStockWhyMovingData(symbol, { forceRefresh: options?.forceRefresh })
}
