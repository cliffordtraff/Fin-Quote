import { getGeneratedStockWhyMovingData } from '@/lib/generated-stock-why-moving'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

/**
 * What the public site shows for "why is it moving": our own generated summary,
 * or nothing.
 *
 * Finviz's why-moving text is scraped only to benchmark our summaries (admin
 * review, the newsletter automation). It is never shown to readers, including
 * as a fallback when we have no summary of our own.
 */
export async function getCachedStockWhyMovingDisplayData(
  symbol: string,
): Promise<StockWhyMovingResult | null> {
  return getGeneratedStockWhyMovingData(symbol)
}

export async function getStockWhyMovingDisplayData(
  symbol: string,
): Promise<StockWhyMovingResult> {
  return (await getGeneratedStockWhyMovingData(symbol)) ?? notFound(symbol)
}

function notFound(symbol: string): StockWhyMovingResult {
  return {
    symbol: symbol.trim().toUpperCase(),
    status: 'not_found',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt: new Date().toISOString(),
    errorMessage: null,
  }
}
