'use server'

import { getStockWhyMovingDisplayData } from '@/lib/stock-why-moving-display'

export async function getStockWhyMoving(
  symbol: string,
  options?: { forceRefresh?: boolean; preferGenerated?: boolean }
) {
  return getStockWhyMovingDisplayData(symbol, options)
}
