import { getGeneratedStockWhyMovingData } from '@/lib/generated-stock-why-moving'
import { getStockWhyMovingData } from '@/lib/stock-why-moving'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

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
