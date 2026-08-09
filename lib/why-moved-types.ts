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

/**
 * The candidate values captured when an editorial queue item was first seen.
 * Legacy rows can only reconstruct identity, so quote fields are nullable rather
 * than pretending that a current quote belonged to an older review date.
 */
export interface WhyMovedCandidateSnapshot {
  reviewKey: string
  symbol: string
  name: string | null
  price: number | null
  change: number | null
  changesPercentage: number | null
  direction: WhyMovedDirection
  session: MarketSession
  marketDate: string
}

export type WhyMovedEditorialSnapshotState = 'captured' | 'legacy_missing'

export interface WhyMovedEditorialDiscovery {
  candidate: WhyMovedCandidate
  catalyst: StockWhyMovingResult
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

export interface WhyMovedEditorialReviewRecord extends WhyMovedReviewRecord {
  candidateSnapshot: WhyMovedCandidateSnapshot
  catalystSnapshot: StockWhyMovingResult
  snapshotState: WhyMovedEditorialSnapshotState
  discoveryRunId: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface WhyMovedEditorialInboxItem {
  candidate: WhyMovedCandidateSnapshot
  catalyst: StockWhyMovingResult
  review: WhyMovedEditorialReviewRecord
  current: boolean
}

export interface WhyMovedEditorialInboxCursor {
  bucket: 0 | 1
  marketDate: string
  firstSeenAt: string
  id: string
}

export interface WhyMovedEditorialInboxQuery {
  currentReviewKeys?: string[]
  /** Omit for the operational inbox; set a value to browse historical rows. */
  status?: WhyMovedReviewStatus | 'all'
  session?: MarketSession | 'all'
  marketDate?: string
  dateFrom?: string
  dateTo?: string
  cursor?: string
  pageSize?: number
}

export interface WhyMovedEditorialInboxPage {
  items: WhyMovedEditorialInboxItem[]
  pageSize: number
  /** Matching rows before cursor pagination. */
  total: number
  /** Facets after date/session/scope filters and before the selected status. */
  statusCounts: Record<WhyMovedReviewStatus, number>
  hasMore: boolean
  nextCursor: string | null
}

export type WhyMovedBulkReviewStatus = Exclude<
  WhyMovedReviewStatus,
  'approved'
>

export interface WhyMovedBulkReviewItem {
  id: string
  expectedUpdatedAt: string
}

export interface WhyMovedBulkReviewTransitionInput {
  targetStatus: WhyMovedBulkReviewStatus
  items: WhyMovedBulkReviewItem[]
  reviewerId: string
  idempotencyKey: string
}

export interface WhyMovedBulkReviewTransitionResult {
  id: string
  status: WhyMovedBulkReviewStatus
  reviewedAt: string | null
  updatedAt: string
  changed: boolean
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
