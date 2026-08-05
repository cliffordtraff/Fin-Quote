'use server'

import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'
import type { SectorData } from '@/app/actions/sectors'
import type { SparklineIndexData } from '@/app/actions/sparkline-indices'

export interface DexterMarketSummaryResult {
  summary: string
  toolsUsed: string[]
  iterations: number
  error?: string
}

export interface MarketDataContext {
  indices?: SparklineIndexData[]
  gainers?: GainerData[]
  losers?: LoserData[]
  sectors?: SectorData[]
}

/**
 * Dexter's local sidecar is intentionally unavailable in deployed builds.
 *
 * The sidecar lives in an ignored directory, so a clean checkout cannot
 * reproduce or audit it. Keep the old action contract while failing closed so
 * any dormant caller gets a predictable result instead of starting a process.
 */
export async function getDexterMarketSummary(
  _marketData?: MarketDataContext,
): Promise<DexterMarketSummaryResult> {
  void _marketData

  return {
    summary: '',
    toolsUsed: [],
    iterations: 0,
    error: 'Dexter is unavailable.',
  }
}
