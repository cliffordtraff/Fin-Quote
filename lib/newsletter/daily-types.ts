import type { NewsletterDraftStatus } from './types'

export type NewsletterDailyRunStatus =
  | 'queued'
  | 'generating'
  | 'completed'
  | 'partial'
  | 'failed'

export type NewsletterDailyItemStatus =
  | 'queued'
  | 'generating'
  | 'generated'
  | 'ready'
  | 'needs_attention'
  | 'failed'
  | 'published'

export type NewsletterDailyQualityBand = 'strong' | 'review'

export type NewsletterBeehiivLifecycleStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'archived'
  | 'unknown'

export interface NewsletterDailyBeehiivDelivery {
  id: string
  postId: string
  editorUrl: string
  previewUrl: string | null
  webUrl: string | null
  lifecycleStatus: NewsletterBeehiivLifecycleStatus
  beehiivStatus: string | null
  scheduledAt: string | null
  publishedAt: string | null
  syncedAt: string
  lastReconciledAt: string | null
  lastReconcileError: string | null
  needsSync: boolean
}

export interface NewsletterRecommendedIssue {
  position: number
  itemId: string
  draftId: string
  ticker: string
  subjectLine: string
  reason: string
  relevanceScore: number
  confidenceScore: number
  movePercent: number | null
}

export type NewsletterNotificationType =
  | 'morning_late'
  | 'morning_completed'
  | 'morning_failed'
  | 'mid_morning_completed'
  | 'mid_morning_failed'
  | 'beehiiv_lifecycle'

export type NewsletterNotificationSeverity =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'

export interface NewsletterNotification {
  id: string
  marketDate: string
  type: NewsletterNotificationType
  severity: NewsletterNotificationSeverity
  title: string
  message: string
  actionUrl: string | null
  metadata: Record<string, unknown>
  readAt: string | null
  deliveredAt: string | null
  createdAt: string
}

export interface NewsletterDailySourceRef {
  kind: string
  label: string
  url?: string
  publishedAt?: string
}

export interface NewsletterDailyCandidate {
  sourceCandidateId: string
  sourceWiimRunId: string
  rank: number
  ticker: string
  companyName: string
  headline: string
  summaryText: string
  keyFact: string | null
  reasonType: string | null
  confidenceScore: number
  relevanceScore: number
  candidateType: string
  stateLabel: string | null
  qualityBand: NewsletterDailyQualityBand
  movePercent: number | null
  price: number | null
  change: number | null
  sourceRefs: NewsletterDailySourceRef[]
  candidateMetadata: Record<string, unknown>
}

export interface NewsletterDailyRunItem {
  id: string
  runId: string
  rank: number
  ticker: string
  status: NewsletterDailyItemStatus
  qualityBand: NewsletterDailyQualityBand
  relevanceScore: number
  confidenceScore: number
  candidateType: string
  stateLabel: string | null
  movePercent: number | null
  reasonType: string | null
  headline: string
  summaryText: string
  keyFact: string | null
  sourceRefs: NewsletterDailySourceRef[]
  candidateMetadata: Record<string, unknown>
  draftId: string | null
  draftStatus: NewsletterDraftStatus | null
  chartId: string | null
  chartImageUrl: string | null
  subjectLine: string | null
  beehiivDelivery: NewsletterDailyBeehiivDelivery | null
  errorMessage: string | null
  retryCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewsletterDailyRun {
  id: string
  marketDate: string
  edition: 'morning'
  status: NewsletterDailyRunStatus
  targetCount: number
  sourceWiimRunId: string | null
  sourceGeneratedAt: string | null
  selectedCount: number
  generatedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  errorMessage: string | null
  metadata: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  items: NewsletterDailyRunItem[]
}

export interface NewsletterDailySettings {
  enabled: boolean
  targetCount: number
  timezone: string
  generationHour: number
}

export interface NewsletterDailyProcessingResult {
  run: NewsletterDailyRun
  attempted: number
  generated: number
  failed: number
}
