'use server'

import {
  getCachedStockWhyMovingDisplayData,
  getStockWhyMovingDisplayData,
} from '@/lib/stock-why-moving-display'

export async function getStockWhyMoving(
  symbol: string,
  options?: { forceRefresh?: boolean; preferGenerated?: boolean }
) {
  if (!options?.forceRefresh && options?.preferGenerated !== false) {
    return getCachedStockWhyMovingDisplayData(symbol)
  }

  return getStockWhyMovingDisplayData(symbol, options)
}
