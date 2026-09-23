'use server'

import { getCachedStockWhyMovingDisplayData } from '@/lib/stock-why-moving-display'

export async function getStockWhyMoving(symbol: string) {
  return getCachedStockWhyMovingDisplayData(symbol)
}
