import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from './daily-types'
import { sha256Hex } from './sha256'

/**
 * The exact issue facts an editor saw when making a shortlist decision.
 * Keep this module browser-safe: the editor uses the same canonical hash as
 * the server without importing persistence, filesystem, or service-role code.
 */
export interface NewsletterEditorialShortlistEvidence {
  itemId: string
  runId: string
  ticker: string
  rank: number
  status: NewsletterDailyRunItem['status']
  qualityBand: NewsletterDailyRunItem['qualityBand']
  relevanceScore: number
  confidenceScore: number
  candidateType: string
  reasonType: string | null
  movePercent: number | null
  headline: string
  subjectLine: string | null
  draftId: string | null
  draftStatus: NewsletterDailyRunItem['draftStatus']
  draftUpdatedAt: string | null
  sourceKinds: string[]
  itemUpdatedAt: string
}

export function buildNewsletterEditorialShortlistEvidence(
  run: NewsletterDailyRun,
  item: NewsletterDailyRunItem,
): NewsletterEditorialShortlistEvidence {
  return {
    itemId: item.id,
    runId: run.id,
    ticker: item.ticker.trim().toUpperCase(),
    rank: item.rank,
    status: item.status,
    qualityBand: item.qualityBand,
    relevanceScore: item.relevanceScore,
    confidenceScore: item.confidenceScore,
    candidateType: item.candidateType,
    reasonType: item.reasonType,
    movePercent: item.movePercent,
    headline: item.headline,
    subjectLine: item.subjectLine,
    draftId: item.draftId,
    draftStatus: item.draftStatus,
    draftUpdatedAt: item.draftUpdatedAt ?? null,
    sourceKinds: [...new Set(
      item.sourceRefs
        .map((source) => source.kind.trim())
        .filter(Boolean),
    )].sort(),
    itemUpdatedAt: item.updatedAt,
  }
}

export function fingerprintNewsletterEditorialShortlistEvidence(
  evidence: NewsletterEditorialShortlistEvidence,
): string {
  return sha256Hex(JSON.stringify({
    itemId: evidence.itemId,
    runId: evidence.runId,
    ticker: evidence.ticker,
    rank: evidence.rank,
    status: evidence.status,
    qualityBand: evidence.qualityBand,
    relevanceScore: evidence.relevanceScore,
    confidenceScore: evidence.confidenceScore,
    candidateType: evidence.candidateType,
    reasonType: evidence.reasonType,
    movePercent: evidence.movePercent,
    headline: evidence.headline,
    subjectLine: evidence.subjectLine,
    draftId: evidence.draftId,
    draftStatus: evidence.draftStatus,
    draftUpdatedAt: evidence.draftUpdatedAt,
    sourceKinds: evidence.sourceKinds,
    itemUpdatedAt: evidence.itemUpdatedAt,
  }))
}
