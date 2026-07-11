import type { StockCandidate, StockNewsItem, EarningsCandidate, RecentPick } from '../newsletter/types'
import type { StockWhyMovingResult } from '../stock-why-moving'

export type WiimRunType = 'morning'
export type WiimRunStatus = 'running' | 'completed' | 'failed'
export type WiimCandidateType = 'newsletter' | 'chart_of_day' | 'roundup' | 'watch_only'
export type WiimStateLabel = 'new' | 'persistent' | 'fading'

export interface WiimCandidateSourceRef {
  kind: 'news' | 'earnings' | 'finviz' | 'recent_pick' | 'market_data'
  label: string
  url?: string | null
  publishedAt?: string | null
}

export interface WiimCandidateSignals {
  movePercent: number
  moveAbsPercent: number
  hasNews: boolean
  newsCount: number
  hasEarnings: boolean
  earningsRecencyHours: number | null
  hasFinvizCatalyst: boolean
  finvizFreshnessMinutes: number | null
  wasRecentlyPicked: boolean
  recentPickAgeDays: number | null
  sentiment: string | null
  scoreBreakdown: Record<string, number>
}

export interface WiimCandidateInput {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  news: StockNewsItem[]
  earningsReport?: EarningsCandidate
  recentPick?: RecentPick
  whyMoving?: StockWhyMovingResult | null
}

export interface RankedWiimCandidate {
  rank: number
  ticker: string | null
  theme: string | null
  headline: string
  whyItMatters: string
  confidenceScore: number
  candidateType: WiimCandidateType
  stateLabel: WiimStateLabel
  signals: WiimCandidateSignals
  sourceRefs: WiimCandidateSourceRef[]
  metadata: {
    symbol: string
    name: string
    price: number
    change: number
    changesPercentage: number
    topNews: StockNewsItem[]
    earningsReport?: EarningsCandidate
    recentPick?: RecentPick
    whyMoving?: StockWhyMovingResult | null
  }
}

export interface WiimRunSummary {
  runType: WiimRunType
  generatedAt: string
  candidateCount: number
  topCandidate: string | null
  bestContrarianCandidate: string | null
  topFive: RankedWiimCandidate[]
  summaryText: string
  metadata: Record<string, unknown>
}

export interface WiimRunRecord {
  id: string
  runType: WiimRunType
  status: WiimRunStatus
  startedAt: string
  completedAt: string | null
  summaryText: string | null
  topCandidate: string | null
  bestContrarianCandidate: string | null
  topFiveJson: RankedWiimCandidate[] | null
  metadataJson: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface WiimCandidateRow {
  id: string
  wiimRunId: string
  rank: number
  ticker: string | null
  theme: string | null
  headline: string
  whyItMatters: string
  confidenceScore: number
  candidateType: WiimCandidateType
  stateLabel: WiimStateLabel | null
  signalsJson: WiimCandidateSignals
  sourceRefsJson: WiimCandidateSourceRef[]
  createdAt: string
}

export interface WiimFetchCandidatesResult {
  generatedAt: string
  marketCandidateCount: number
  candidates: WiimCandidateInput[]
}

export function isStockCandidate(value: unknown): value is StockCandidate {
  if (!value || typeof value !== 'object') return false
  const candidate = value as StockCandidate
  return typeof candidate.symbol === 'string' && typeof candidate.changesPercentage === 'number'
}
