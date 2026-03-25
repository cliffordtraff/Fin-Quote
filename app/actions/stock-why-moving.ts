'use server'

import { getStockWhyMovingData } from '@/lib/stock-why-moving'

export async function getStockWhyMoving(
  symbol: string,
  options?: { forceRefresh?: boolean }
) {
  return getStockWhyMovingData(symbol, options)
}
