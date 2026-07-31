import type { MarketSession } from '@/lib/market-hours'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

export type WhyMovedDirection = 'gainer' | 'loser'
export type WhyMovedReviewStatus =
  | 'pending'
  | 'approved'
  | 'needs_work'
  | 'dismissed'

export interface WhyMovedCandidate {
  reviewKey: string
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  direction: WhyMovedDirection
  session: MarketSession
  marketDate: string
}

export interface WhyMovedReviewRecord {
  id: string
  reviewKey: string
  symbol: string
  marketDate: string
  session: MarketSession
  direction: WhyMovedDirection
  status: WhyMovedReviewStatus
  notes: string
  reviewerId: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WhyMovedQueueItem extends WhyMovedCandidate {
  whyMoving: StockWhyMovingResult
  review: WhyMovedReviewRecord | null
  reviewStatus: WhyMovedReviewStatus
  newsletterDraft?: {
    id: string
    status: string
    subjectLine: string
    chartsAttached: number
    beehiivUrl: string | null
  } | null
}
