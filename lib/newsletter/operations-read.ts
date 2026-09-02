import type {
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
  BeehiivLifecycleStatus,
} from '@/lib/beehiiv/types'
import type { Database } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { NewsletterDraftScope } from './drafts'
import {
  getNewsletterAutomationClock,
  getNewsletterAutomationWindow,
} from './automation-clock'
import type {
  NewsletterDailyAutomationRun,
  NewsletterDailyAutomationStage,
} from './daily-automation'
import type {
  NewsletterDailyItemStatus,
  NewsletterDailySettings,
  NewsletterNotification,
} from './daily-types'
import type {
  NewsletterMidMorningStage,
  NewsletterMidMorningRun,
} from './mid-morning-automation'

export type NewsletterOperationsPipeline = 'morning' | 'mid_morning'
export type NewsletterOperationsPipelineAction = 'run_now' | 'retry_failed'
export type NewsletterOperationsAction =
  | NewsletterOperationsPipelineAction
  | 'reconcile_beehiiv'

const NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT = 100
const NEWSLETTER_OPERATIONS_DELIVERY_DISPLAY_LIMIT = 20

export class NewsletterOperationsCurrentDraftLimitError extends Error {
  readonly limit = NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT

  constructor() {
    super(
      `Newsletter Operations found more than ${NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT} drafts for one market date. Refusing to show partial Beehiiv counts.`,
    )
    this.name = 'NewsletterOperationsCurrentDraftLimitError'
  }
}

export type NewsletterOperationsActionInput =
  | {
      pipeline: NewsletterOperationsPipeline
      action: NewsletterOperationsPipelineAction
      marketDate: string
    }
  | { action: 'reconcile_beehiiv' }

export interface NewsletterOperationsReconciliationResult {
  attempted: number
  updated: number
  failed: Array<{ draftId: string; error: string }>
}

export interface NewsletterOperationsMetric {
  id: string
  label: string
  completed: number
  total: number
  successful: number
  errors: number
}

export interface NewsletterOperationsPipelineRun {
  id: string
  pipeline: NewsletterOperationsPipeline
  marketDate: string
  status: string
  stage: string
  stageLabel: string
  retryStage: string | null
  stageFailureCount: number
  invocationCount: number
  lastError: string | null
  startedAt: string | null
  completedAt: string | null
  lastHeartbeatAt: string | null
  createdAt: string
  updatedAt: string
  meaningfulChange: boolean | null
  metrics: NewsletterOperationsMetric[]
}

export interface NewsletterOperationsIssueException {
  id: string
  ticker: string
  status: NewsletterDailyItemStatus
  retryCount: number
  errorMessage: string | null
  draftId: string | null
}

export interface NewsletterOperationsDailyRun {
  id: string
  status: string
  targetCount: number
  selectedCount: number
  generatedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  startedAt: string | null
  completedAt: string | null
  exceptions: NewsletterOperationsIssueException[]
}

export interface NewsletterOperationsDelivery {
  id: string
  draftId: string
  title: string
  editorUrl: string
  webUrl: string | null
  lifecycleStatus: BeehiivLifecycleStatus
  beehiivStatus: string | null
  scheduledAt: string | null
  publishedAt: string | null
  syncedAt: string
  lastReconciledAt: string | null
  lastReconcileError: string | null
  statsLastFetchedAt: string | null
  statsLastError: string | null
  stats: NewsletterOperationsDeliveryStats
}

export interface NewsletterOperationsDeliveryStats {
  sent: number | null
  delivered: number | null
  opens: number | null
  uniqueOpens: number | null
  openRate: number | null
  clicks: number | null
  uniqueClicks: number | null
  clickRate: number | null
  bounces: number | null
  hardBounces: number | null
  softBounces: number | null
  deferred: number | null
  suppressed: number | null
  bounceRate: number | null
  unsubscribes: number | null
  unsubscribeRate: number | null
  spamReports: number | null
  spamReportRate: number | null
  webViews: number | null
  webClicks: number | null
}

export interface NewsletterOperationsLifecycleHealth {
  latestReconciledAt: string | null
  freshnessMs: number | null
  oldestActiveCheckAt: string | null
  averagePublishLatencyMs: number | null
}

export interface NewsletterOperationsWebhookHealth {
  configured: boolean
  configurationError: string | null
  missing: string[]
  pending: number
  delivering: number
  delivered: number
  errors: number
  oldestDueAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  queryError: string | null
}

export interface NewsletterOperationsSnapshot {
  generatedAt: string
  marketDate: string
  clock: ReturnType<typeof getNewsletterAutomationClock>
  windows: {
    morning: ReturnType<typeof getNewsletterAutomationWindow>
    midMorning: ReturnType<typeof getMidMorningAutomationWindow>
  }
  settings: NewsletterDailySettings
  webhookConfigured: boolean
  webhook: NewsletterOperationsWebhookHealth
  morning: NewsletterOperationsPipelineRun | null
  midMorning: NewsletterOperationsPipelineRun | null
  dailyRun: NewsletterOperationsDailyRun | null
  notifications: NewsletterNotification[]
  beehiiv: {
    integration: BeehiivIntegrationStatus
    marketDateCounts: Record<BeehiivLifecycleStatus, number>
    overallCounts: Record<BeehiivLifecycleStatus, number>
    overallTotal: number
    reconcileErrors: number
    staleCount: number
    lifecycle: NewsletterOperationsLifecycleHealth
    stats: NewsletterOperationsDeliveryStats
    deliveries: NewsletterOperationsDelivery[]
  }
  history: NewsletterOperationsPipelineRun[]
}

export class NewsletterOperatorAccessError extends Error {
  constructor(message = 'This account cannot operate the newsletter pipeline.') {
    super(message)
    this.name = 'NewsletterOperatorAccessError'
  }
}

export class NewsletterOperationsActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterOperationsActionError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

type DailyAutomationRow =
  Database['public']['Tables']['newsletter_daily_automation_runs']['Row']
type MidMorningRow =
  Database['public']['Tables']['newsletter_mid_morning_runs']['Row']
type DailyRunItemRow =
  Database['public']['Tables']['newsletter_daily_run_items']['Row']
type NotificationRow =
  Database['public']['Tables']['newsletter_notifications']['Row']
type BeehiivDeliveryRow =
  Database['public']['Tables']['newsletter_beehiiv_deliveries']['Row']

interface NewsletterOperationsDailyRunReadModel {
  id: string
  status: string
  targetCount: number
  selectedCount: number
  generatedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  startedAt: string | null
  completedAt: string | null
  items: Array<{
    id: string
    ticker: string
    status: NewsletterDailyItemStatus
    retryCount: number
    errorMessage: string | null
    draftId: string | null
  }>
}

export function getConfiguredNewsletterAutomationScope(): NewsletterDraftScope | null {
  const ownerId = process.env.NEWSLETTER_AUTOMATION_OWNER_ID?.trim() || null
  const sessionId =
    process.env.NEWSLETTER_AUTOMATION_SESSION_ID?.trim() ||
    'newsletter-daily-automation'
  if (!ownerId && !process.env.NEWSLETTER_AUTOMATION_SESSION_ID?.trim()) {
    return null
  }
  return { ownerId, sessionId }
}

function getNewsletterDailyScopeKey(scope: NewsletterDraftScope): string {
  return scope.ownerId
    ? `owner:${scope.ownerId}`
    : `session:${scope.sessionId}`
}

function mapDailyAutomationRow(
  row: DailyAutomationRow,
): NewsletterDailyAutomationRun {
  return {
    id: row.id,
    marketDate: row.market_date,
    status: row.status as NewsletterDailyAutomationRun['status'],
    stage: row.stage as NewsletterDailyAutomationStage,
    candidateSymbols: row.candidate_symbols,
    candidateCount: row.candidate_count,
    finvizCompletedCount: row.finviz_completed_count,
    finvizFoundCount: row.finviz_found_count,
    finvizErrorCount: row.finviz_error_count,
    summaryCompletedCount: row.summary_completed_count,
    summaryGeneratedCount: row.summary_generated_count,
    summaryNoResultCount: row.summary_no_result_count,
    summaryErrorCount: row.summary_error_count,
    wiimRunId: row.wiim_run_id,
    newsletterScopeCount: row.newsletter_scope_count,
    newsletterCompletedScopeCount: row.newsletter_completed_scope_count,
    newsletterSelectedCount: row.newsletter_selected_count,
    newsletterGeneratedCount: row.newsletter_generated_count,
    newsletterReadyCount: row.newsletter_ready_count,
    newsletterAttentionCount: row.newsletter_attention_count,
    newsletterFailedCount: row.newsletter_failed_count,
    invocationCount: row.invocation_count,
    lastError: row.last_error,
    notificationAppliedAt: row.notification_applied_at,
    notificationAttemptCount: row.notification_attempt_count,
    notificationLastError: row.notification_last_error,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMidMorningRow(row: MidMorningRow): NewsletterMidMorningRun {
  return {
    id: row.id,
    marketDate: row.market_date,
    status: row.status as NewsletterMidMorningRun['status'],
    stage: row.stage as NewsletterMidMorningStage,
    candidateSymbols: row.candidate_symbols,
    candidateCount: row.candidate_count,
    finvizCompletedCount: row.finviz_completed_count,
    finvizFoundCount: row.finviz_found_count,
    finvizErrorCount: row.finviz_error_count,
    morningWiimRunId: row.morning_wiim_run_id,
    midMorningWiimRunId: row.mid_morning_wiim_run_id,
    summaryCompletedCount: row.summary_completed_count,
    summaryGeneratedCount: row.summary_generated_count,
    summaryErrorCount: row.summary_error_count,
    meaningfulChange: row.meaningful_change,
    invocationCount: row.invocation_count,
    lastError: row.last_error,
    notificationAppliedAt: row.notification_applied_at,
    notificationAttemptCount: row.notification_attempt_count,
    notificationLastError: row.notification_last_error,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getNewsletterAutomationStageLabel(
  stage: NewsletterDailyAutomationStage,
): string {
  switch (stage) {
    case 'collecting':
      return 'Collecting market candidates'
    case 'finviz':
      return 'Refreshing Finviz catalysts'
    case 'wiim':
      return 'Ranking the WIIM report'
    case 'summaries':
      return 'Writing original summaries'
    case 'newsletters':
      return 'Generating charts and emails'
    case 'finalizing':
      return 'Running final quality checks'
    case 'completed':
      return 'Morning report ready'
    case 'failed':
      return 'Automation stopped'
  }
}

function getMidMorningAutomationStageLabel(
  stage: NewsletterMidMorningStage,
): string {
  switch (stage) {
    case 'collecting':
      return 'Collecting live movers'
    case 'finviz':
      return 'Refreshing Finviz catalysts'
    case 'wiim':
      return 'Re-ranking the market'
    case 'summaries':
      return 'Writing updated summaries'
    case 'finalizing':
      return 'Calculating morning deltas'
    case 'completed':
      return 'Mid-morning report ready'
    case 'failed':
      return 'Mid-morning automation stopped'
  }
}

function getMidMorningAutomationWindow(
  clock: ReturnType<typeof getNewsletterAutomationClock>,
) {
  const minuteOfDay = clock.hour * 60 + clock.minute
  const startMinuteOfDay = 10 * 60 + 15
  const lateMinuteOfDay = 11 * 60
  const endMinuteOfDay = 12 * 60
  return {
    startHour: 10,
    startMinute: 15,
    shouldRun:
      clock.isTradingDay &&
      minuteOfDay >= startMinuteOfDay &&
      minuteOfDay < endMinuteOfDay,
    isLate:
      clock.isTradingDay &&
      minuteOfDay >= lateMinuteOfDay &&
      minuteOfDay < endMinuteOfDay,
    hasEnded: minuteOfDay >= endMinuteOfDay,
  }
}

async function getNewsletterDailyAutomationRun(
  marketDate?: string,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun | null> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_daily_automation_runs')
    .select('*')
    .order('market_date', { ascending: false })
    .limit(1)
  if (marketDate) query = query.eq('market_date', marketDate)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load newsletter automation: ${error.message}`)
  }
  return data ? mapDailyAutomationRow(data as DailyAutomationRow) : null
}

async function listNewsletterDailyAutomationRuns(
  limit = 7,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun[]> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_daily_automation_runs')
    .select('*')
    .order('market_date', { ascending: false })
    .limit(Math.max(1, Math.min(30, limit)))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to list newsletter automation runs: ${error.message}`)
  }
  return ((data ?? []) as DailyAutomationRow[]).map(mapDailyAutomationRow)
}

async function getNewsletterMidMorningRun(
  marketDate?: string,
  signal?: AbortSignal,
): Promise<NewsletterMidMorningRun | null> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_mid_morning_runs')
    .select('*')
    .order('market_date', { ascending: false })
    .limit(1)
  if (marketDate) query = query.eq('market_date', marketDate)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load mid-morning automation: ${error.message}`)
  }
  return data ? mapMidMorningRow(data as MidMorningRow) : null
}

async function listNewsletterMidMorningRuns(
  limit = 7,
  signal?: AbortSignal,
): Promise<NewsletterMidMorningRun[]> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_mid_morning_runs')
    .select('*')
    .order('market_date', { ascending: false })
    .limit(Math.max(1, Math.min(30, limit)))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to list mid-morning automation: ${error.message}`)
  }
  return ((data ?? []) as MidMorningRow[]).map(mapMidMorningRow)
}

async function getNewsletterDailySettings(
  scope: NewsletterDraftScope,
  signal?: AbortSignal,
): Promise<NewsletterDailySettings> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_daily_settings')
    .select('enabled,target_count,timezone,generation_hour')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load newsletter daily settings: ${error.message}`)
  }
  return data
    ? {
        enabled: data.enabled,
        targetCount: data.target_count,
        timezone: data.timezone,
        generationHour: data.generation_hour,
      }
    : {
        enabled: true,
        targetCount: 40,
        timezone: 'America/New_York',
        generationHour: 8,
      }
}

async function getLatestNewsletterDailyRun(
  scope: NewsletterDraftScope,
  marketDate?: string,
  signal?: AbortSignal,
): Promise<NewsletterOperationsDailyRunReadModel | null> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let runQuery = supabase
    .from('newsletter_daily_runs')
    .select(
      'id,status,target_count,selected_count,generated_count,ready_count,attention_count,failed_count,started_at,completed_at',
    )
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .order('market_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  if (marketDate) runQuery = runQuery.eq('market_date', marketDate)
  if (signal) runQuery = runQuery.abortSignal(signal)
  const { data: run, error: runError } = await runQuery.maybeSingle()
  if (runError) {
    throw new Error(`Failed to find newsletter daily run: ${runError.message}`)
  }
  if (!run) return null

  let itemsQuery = supabase
    .from('newsletter_daily_run_items')
    .select('id,ticker,status,retry_count,error_message,draft_id,rank')
    .eq('run_id', run.id)
    .order('rank', { ascending: true })
  if (signal) itemsQuery = itemsQuery.abortSignal(signal)
  const { data: itemRows, error: itemError } = await itemsQuery
  if (itemError) {
    throw new Error(`Failed to load newsletter daily run items: ${itemError.message}`)
  }

  const rawItems = (itemRows ?? []) as Pick<
    DailyRunItemRow,
    | 'id'
    | 'ticker'
    | 'status'
    | 'retry_count'
    | 'error_message'
    | 'draft_id'
  >[]
  const draftIds = Array.from(
    new Set(rawItems.flatMap((item) => (item.draft_id ? [item.draft_id] : []))),
  )
  const draftStatuses = new Map<string, string>()
  const deliveryStatuses = new Map<string, string>()
  if (draftIds.length > 0) {
    let draftsQuery = supabase
      .from('newsletter_drafts')
      .select('id,status')
      .in('id', draftIds)
    draftsQuery = scope.ownerId
      ? draftsQuery.eq('owner_id', scope.ownerId)
      : draftsQuery.is('owner_id', null).eq('session_id', scope.sessionId)
    if (signal) draftsQuery = draftsQuery.abortSignal(signal)

    let deliveriesQuery = scope.ownerId
      ? supabase
          .from('newsletter_beehiiv_deliveries')
          .select('draft_id,lifecycle_status')
          .eq('owner_id', scope.ownerId)
          .in('draft_id', draftIds)
      : null
    if (signal && deliveriesQuery) {
      deliveriesQuery = deliveriesQuery.abortSignal(signal)
    }
    const [draftsResult, deliveriesResult] = await Promise.all([
      draftsQuery,
      deliveriesQuery ?? Promise.resolve({ data: [], error: null }),
    ])
    if (draftsResult.error || deliveriesResult.error) {
      throw new Error(
        `Failed to sync newsletter daily item states: ${
          draftsResult.error?.message ?? deliveriesResult.error?.message
        }`,
      )
    }
    for (const draft of draftsResult.data ?? []) {
      draftStatuses.set(draft.id, draft.status)
    }
    for (const delivery of deliveriesResult.data ?? []) {
      deliveryStatuses.set(delivery.draft_id, delivery.lifecycle_status)
    }
  }

  return {
    id: run.id,
    status: run.status,
    targetCount: run.target_count,
    selectedCount: run.selected_count,
    generatedCount: run.generated_count,
    readyCount: run.ready_count,
    attentionCount: run.attention_count,
    failedCount: run.failed_count,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    items: rawItems.map((row) => {
      const draftStatus = row.draft_id
        ? draftStatuses.get(row.draft_id)
        : null
      const deliveryStatus = row.draft_id
        ? deliveryStatuses.get(row.draft_id)
        : null
      const status: NewsletterDailyItemStatus =
        draftStatus === 'published' || deliveryStatus === 'published'
          ? 'published'
          : draftStatus === 'ready'
            ? 'ready'
            : (row.status as NewsletterDailyItemStatus)
      return {
        id: row.id,
        ticker: row.ticker,
        status,
        retryCount: row.retry_count,
        errorMessage: row.error_message,
        draftId: row.draft_id,
      }
    }),
  }
}

async function listNewsletterNotifications(
  scope: NewsletterDraftScope,
  options: { marketDate?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NewsletterNotification[]> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_notifications')
    .select('*')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, options.limit ?? 12)))
  if (options.marketDate) query = query.eq('market_date', options.marketDate)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load newsletter notifications: ${error.message}`)
  }
  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    marketDate: row.market_date,
    type: row.notification_type as NewsletterNotification['type'],
    severity: row.severity as NewsletterNotification['severity'],
    title: row.title,
    message: row.message,
    actionUrl: row.action_url,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    readAt: row.read_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  }))
}

async function getBeehiivIntegrationStatus(
  ownerId: string,
  signal?: AbortSignal,
): Promise<BeehiivIntegrationStatus> {
  signal?.throwIfAborted()
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_integrations')
    .select(
      'publication_id,publication_name,publication_url,connected_at,last_verified_at',
    )
    .eq('owner_id', ownerId)
    .eq('provider', 'beehiiv')
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load Beehiiv connection: ${error.message}`)
  }
  return {
    connected: Boolean(data),
    publication:
      data?.publication_id && data.publication_name
        ? {
            id: data.publication_id,
            name: data.publication_name,
            description: null,
            url: data.publication_url,
          }
        : null,
    connectedAt: data?.connected_at ?? null,
    lastVerifiedAt: data?.last_verified_at ?? null,
  }
}

function mapBeehiivDeliveryRow(
  row: BeehiivDeliveryRow,
): BeehiivDeliveryRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    ownerId: row.owner_id,
    publicationId: row.publication_id,
    postId: row.beehiiv_post_id,
    title: row.title,
    previewUrl: row.preview_url,
    editorUrl: row.editor_url,
    webUrl: row.web_url,
    contentHash: row.content_hash,
    sourceDraftUpdatedAt: row.source_draft_updated_at,
    lifecycleStatus: row.lifecycle_status as BeehiivLifecycleStatus,
    lifecycleAppliedStatus:
      row.lifecycle_applied_status as BeehiivLifecycleStatus | null,
    lifecycleAppliedAt: row.lifecycle_applied_at,
    beehiivStatus: row.beehiiv_status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    stats: isRecord(row.stats_json) ? row.stats_json : {},
    statsLastFetchedAt: row.stats_last_fetched_at,
    statsLastError: row.stats_last_error,
    syncedAt: row.synced_at,
    lastReconciledAt: row.last_reconciled_at,
    lastReconcileError: row.last_reconcile_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listBeehiivDeliveries(
  ownerId: string,
  draftIds: string[] = [],
  signal?: AbortSignal,
): Promise<BeehiivDeliveryRecord[]> {
  signal?.throwIfAborted()
  const normalizedIds = Array.from(new Set(draftIds.filter(Boolean)))
  if (normalizedIds.length === 0) return []
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('newsletter_beehiiv_deliveries')
    .select('*')
    .eq('owner_id', ownerId)
    .in('draft_id', normalizedIds)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load Beehiiv deliveries: ${error.message}`)
  }
  return ((data ?? []) as BeehiivDeliveryRow[]).map(mapBeehiivDeliveryRow)
}

async function countBeehiivDeliveriesByLifecycle(
  ownerId: string,
  signal?: AbortSignal,
): Promise<Record<BeehiivLifecycleStatus, number>> {
  signal?.throwIfAborted()
  const statuses = [
    'draft',
    'scheduled',
    'published',
    'archived',
    'unknown',
  ] as const satisfies readonly BeehiivLifecycleStatus[]
  const supabase = createServiceRoleClient()
  const entries = await Promise.all(
    statuses.map(async (status) => {
      let query = supabase
        .from('newsletter_beehiiv_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('lifecycle_status', status)
      if (signal) query = query.abortSignal(signal)
      const { count, error } = await query
      if (error) {
        throw new Error(
          `Failed to count ${status} Beehiiv deliveries: ${error.message}`,
        )
      }
      return [status, count ?? 0] as const
    }),
  )
  return Object.fromEntries(entries) as Record<BeehiivLifecycleStatus, number>
}

function getNewsletterWebhookConfiguration() {
  const rawUrl = process.env.NEWSLETTER_ALERT_WEBHOOK_URL?.trim() ?? ''
  const signingSecret =
    process.env.NEWSLETTER_ALERT_WEBHOOK_SECRET?.trim() ?? ''
  const missing: string[] = []
  if (!rawUrl) missing.push('NEWSLETTER_ALERT_WEBHOOK_URL')
  if (!signingSecret) missing.push('NEWSLETTER_ALERT_WEBHOOK_SECRET')
  if (missing.length > 0) {
    return { configured: false as const, missing, error: null }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return {
      configured: false as const,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL is not a valid URL.',
    }
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      configured: false as const,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL must use HTTP or HTTPS.',
    }
  }
  if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
    return {
      configured: false as const,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_URL must use HTTPS in production.',
    }
  }
  if (signingSecret.length < 32) {
    return {
      configured: false as const,
      missing: [],
      error: 'NEWSLETTER_ALERT_WEBHOOK_SECRET must be at least 32 characters.',
    }
  }
  return { configured: true as const, missing: [], error: null }
}

function emptyLifecycleCounts(): Record<BeehiivLifecycleStatus, number> {
  return {
    draft: 0,
    scheduled: 0,
    published: 0,
    archived: 0,
    unknown: 0,
  }
}

function countDeliveryLifecycle(
  deliveries: BeehiivDeliveryRecord[],
): Record<BeehiivLifecycleStatus, number> {
  const counts = emptyLifecycleCounts()
  for (const delivery of deliveries) counts[delivery.lifecycleStatus] += 1
  return counts
}

function numericField(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value.replace('%', ''))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function rateField(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().endsWith('%')) {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) return parsed / 100
    }
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return parsed > 1 ? parsed / 100 : parsed
  }
  return null
}

function normalizeBeehiivStats(
  stats: Record<string, unknown>,
): NewsletterOperationsDeliveryStats {
  const email = isRecord(stats.email) ? stats.email : {}
  const web = isRecord(stats.web) ? stats.web : {}
  const sent = numericField(email, ['total_sent', 'recipients', 'sent'])
  const delivered = numericField(email, ['total_delivered', 'delivered'])
  const uniqueOpens = numericField(email, [
    'total_unique_opened',
    'unique_opens',
    'uniqueOpens',
  ])
  const uniqueClicks = numericField(email, [
    'total_unique_email_clicked_verified',
    'total_unique_email_clicked_raw',
    'unique_clicks',
    'uniqueClicks',
  ])
  const reportedBounces = numericField(email, [
    'bounces',
    'bounced',
    'total_bounces',
  ])
  const hardBounces = numericField(email, ['total_hard_bounced'])
  const softBounces = numericField(email, ['total_soft_bounced'])
  const providerBounces =
    hardBounces !== null || softBounces !== null
      ? (hardBounces ?? 0) + (softBounces ?? 0)
      : null
  const bounces =
    reportedBounces ??
    providerBounces ??
    (sent !== null && delivered !== null
      ? Math.max(0, sent - delivered)
      : null)
  const unsubscribes = numericField(email, [
    'total_unsubscribes',
    'unsubscribes',
  ])
  const spamReports = numericField(email, [
    'total_spam_reported',
    'spam_reports',
    'spamReports',
  ])

  return {
    sent,
    delivered,
    opens: numericField(email, ['total_opened', 'opens']),
    uniqueOpens,
    openRate:
      rateField(email, ['open_rate', 'openRate']) ??
      (delivered && uniqueOpens !== null ? uniqueOpens / delivered : null),
    clicks: numericField(email, [
      'total_email_clicked_verified',
      'total_email_clicked_raw',
      'clicks',
    ]),
    uniqueClicks,
    clickRate:
      rateField(email, ['click_rate', 'clickRate']) ??
      (delivered && uniqueClicks !== null ? uniqueClicks / delivered : null),
    bounces,
    hardBounces,
    softBounces,
    deferred: numericField(email, ['total_deferred', 'deferred']),
    suppressed: numericField(email, [
      'total_suppressed',
      'suppressed',
      'total_dropped',
      'dropped',
    ]),
    bounceRate:
      rateField(email, ['bounce_rate', 'bounceRate']) ??
      (sent && bounces !== null ? bounces / sent : null),
    unsubscribes,
    unsubscribeRate:
      rateField(email, ['unsubscribe_rate', 'unsubscribeRate']) ??
      (sent && unsubscribes !== null ? unsubscribes / sent : null),
    spamReports,
    spamReportRate:
      rateField(email, ['spam_rate', 'spamRate', 'complaint_rate']) ??
      (sent && spamReports !== null ? spamReports / sent : null),
    webViews: numericField(web, ['total_web_viewed', 'views']),
    webClicks: numericField(web, ['total_web_clicked', 'clicks']),
  }
}

const DELIVERY_STATS_FIELDS: Array<keyof NewsletterOperationsDeliveryStats> = [
  'sent',
  'delivered',
  'opens',
  'uniqueOpens',
  'clicks',
  'uniqueClicks',
  'bounces',
  'hardBounces',
  'softBounces',
  'deferred',
  'suppressed',
  'unsubscribes',
  'spamReports',
  'webViews',
  'webClicks',
]

function aggregateBeehiivStats(
  deliveries: BeehiivDeliveryRecord[],
): NewsletterOperationsDeliveryStats {
  const normalized = deliveries.map((delivery) =>
    normalizeBeehiivStats(delivery.stats),
  )
  const aggregate = normalizeBeehiivStats({})
  for (const field of DELIVERY_STATS_FIELDS) {
    const values = normalized.flatMap((stats) => {
      const value = stats[field]
      return typeof value === 'number' ? [value] : []
    })
    aggregate[field] = values.length
      ? values.reduce((total, value) => total + value, 0)
      : null
  }
  const delivered = aggregate.delivered
  aggregate.openRate =
    delivered && aggregate.uniqueOpens !== null
      ? aggregate.uniqueOpens / delivered
      : null
  aggregate.clickRate =
    delivered && aggregate.uniqueClicks !== null
      ? aggregate.uniqueClicks / delivered
      : null
  aggregate.bounceRate =
    aggregate.sent && aggregate.bounces !== null
      ? aggregate.bounces / aggregate.sent
      : null
  aggregate.unsubscribeRate =
    aggregate.sent && aggregate.unsubscribes !== null
      ? aggregate.unsubscribes / aggregate.sent
      : null
  aggregate.spamReportRate =
    aggregate.sent && aggregate.spamReports !== null
      ? aggregate.spamReports / aggregate.sent
      : null
  return aggregate
}

function averageDuration(values: number[]): number | null {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null
}

function validTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function summarizeBeehiivLifecycle(
  deliveries: BeehiivDeliveryRecord[],
  now = new Date(),
): NewsletterOperationsLifecycleHealth {
  const reconciled = deliveries.flatMap((delivery) => {
    const value = validTimestamp(delivery.lastReconciledAt)
    return value === null ? [] : [value]
  })
  const activeChecks = deliveries.flatMap((delivery) => {
    if (!['draft', 'scheduled', 'unknown'].includes(delivery.lifecycleStatus)) {
      return []
    }
    const value =
      validTimestamp(delivery.lastReconciledAt) ??
      validTimestamp(delivery.syncedAt)
    return value === null ? [] : [value]
  })
  const publishLatencies = deliveries.flatMap((delivery) => {
    const synced = validTimestamp(delivery.syncedAt)
    const published = validTimestamp(delivery.publishedAt)
    return synced === null || published === null
      ? []
      : [Math.max(0, published - synced)]
  })
  const latest = reconciled.length ? Math.max(...reconciled) : null

  return {
    latestReconciledAt: latest === null ? null : new Date(latest).toISOString(),
    freshnessMs: latest === null ? null : Math.max(0, now.getTime() - latest),
    oldestActiveCheckAt: activeChecks.length
      ? new Date(Math.min(...activeChecks)).toISOString()
      : null,
    averagePublishLatencyMs: averageDuration(publishLatencies),
  }
}

function numericValues(value: unknown): number[] {
  if (!isRecord(value)) return []
  return Object.values(value).flatMap((entry) => {
    const parsed = Number(entry)
    return Number.isFinite(parsed) ? [parsed] : []
  })
}

function retryDetails(metadata: Record<string, unknown>) {
  const retryStage =
    typeof metadata.lastFailureStage === 'string'
      ? metadata.lastFailureStage
      : null
  const stageFailureCount = numericValues(metadata.stageErrorCounts).reduce(
    (total, count) => total + count,
    0,
  )
  return { retryStage, stageFailureCount }
}

function mapMorningRun(
  run: NewsletterDailyAutomationRun,
): NewsletterOperationsPipelineRun {
  const retry = retryDetails(run.metadata)
  const storedSummaryScopeCount = Number(run.metadata.summaryScopeCount)
  const summaryScopeCount =
    Number.isSafeInteger(storedSummaryScopeCount) && storedSummaryScopeCount > 0
      ? storedSummaryScopeCount
      : run.candidateCount
  return {
    id: run.id,
    pipeline: 'morning',
    marketDate: run.marketDate,
    status: run.status,
    stage: run.stage,
    stageLabel: getNewsletterAutomationStageLabel(run.stage),
    retryStage: retry.retryStage,
    stageFailureCount: retry.stageFailureCount,
    invocationCount: run.invocationCount,
    lastError: run.lastError,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    lastHeartbeatAt: run.lastHeartbeatAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    meaningfulChange: null,
    metrics: [
      {
        id: 'finviz',
        label: 'Finviz catalysts',
        completed: run.finvizCompletedCount,
        total: run.candidateCount,
        successful: run.finvizFoundCount,
        errors: run.finvizErrorCount,
      },
      {
        id: 'summaries',
        label: 'Original summaries',
        completed: run.summaryCompletedCount,
        total: summaryScopeCount,
        successful: run.summaryGeneratedCount,
        errors: run.summaryErrorCount,
      },
      {
        id: 'newsletters',
        label: 'Newsletter issues',
        completed: run.newsletterGeneratedCount,
        total: run.newsletterSelectedCount,
        successful: run.newsletterReadyCount,
        errors:
          run.newsletterAttentionCount + run.newsletterFailedCount,
      },
    ],
  }
}

function mapMidMorningRun(
  run: NewsletterMidMorningRun,
): NewsletterOperationsPipelineRun {
  const retry = retryDetails(run.metadata)
  return {
    id: run.id,
    pipeline: 'mid_morning',
    marketDate: run.marketDate,
    status: run.status,
    stage: run.stage,
    stageLabel: getMidMorningAutomationStageLabel(run.stage),
    retryStage: retry.retryStage,
    stageFailureCount: retry.stageFailureCount,
    invocationCount: run.invocationCount,
    lastError: run.lastError,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    lastHeartbeatAt: run.lastHeartbeatAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    meaningfulChange: run.meaningfulChange,
    metrics: [
      {
        id: 'finviz',
        label: 'Finviz refresh',
        completed: run.finvizCompletedCount,
        total: run.candidateCount,
        successful: run.finvizFoundCount,
        errors: run.finvizErrorCount,
      },
      {
        id: 'summaries',
        label: 'Updated summaries',
        completed: run.summaryCompletedCount,
        total: 5,
        successful: run.summaryGeneratedCount,
        errors: run.summaryErrorCount,
      },
    ],
  }
}

export function resolveOperatorScope(userId: string): NewsletterDraftScope {
  const configured = getConfiguredNewsletterAutomationScope()
  if (configured?.ownerId && configured.ownerId !== userId) {
    throw new NewsletterOperatorAccessError()
  }
  return (
    configured ?? {
      ownerId: userId,
      sessionId: 'newsletter-operations',
    }
  )
}

function emptyIntegration(): BeehiivIntegrationStatus {
  return {
    connected: false,
    publication: null,
    connectedAt: null,
    lastVerifiedAt: null,
  }
}

export function validMarketDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

interface NewsletterOperationsBeehiivData {
  marketDateDeliveries: BeehiivDeliveryRecord[]
  overallCounts: Record<BeehiivLifecycleStatus, number>
  overallTotal: number
}

interface NewsletterOperationsBeehiivDependencies {
  listDeliveries: typeof listBeehiivDeliveries
  countByLifecycle: typeof countBeehiivDeliveriesByLifecycle
}

const newsletterOperationsBeehiivDependencies: NewsletterOperationsBeehiivDependencies = {
  listDeliveries: listBeehiivDeliveries,
  countByLifecycle: countBeehiivDeliveriesByLifecycle,
}

async function listNewsletterOperationsMarketDateDraftIds(
  scope: NewsletterDraftScope,
  marketDate: string,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted()
  if (!validMarketDate(marketDate)) {
    throw new NewsletterOperationsActionError('Invalid market date.')
  }
  const supabase = createServiceRoleClient()
  let query = supabase.from('newsletter_drafts').select('id')
  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)
  query = query
    .eq('source_market_date', marketDate)
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT + 1)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(
      `Failed to load current newsletter operation drafts: ${error.message}`,
    )
  }
  if ((data?.length ?? 0) > NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT) {
    throw new NewsletterOperationsCurrentDraftLimitError()
  }
  return (data ?? []).map((row) => row.id)
}

async function loadNewsletterOperationsBeehiivData(
  scope: NewsletterDraftScope,
  marketDate: string,
  signal?: AbortSignal,
  dependencies: NewsletterOperationsBeehiivDependencies =
    newsletterOperationsBeehiivDependencies,
): Promise<NewsletterOperationsBeehiivData> {
  signal?.throwIfAborted()
  if (!scope.ownerId) {
    return {
      marketDateDeliveries: [],
      overallCounts: emptyLifecycleCounts(),
      overallTotal: 0,
    }
  }

  const [draftIds, overallCounts] = await Promise.all([
    listNewsletterOperationsMarketDateDraftIds(scope, marketDate, signal),
    dependencies.countByLifecycle(scope.ownerId, signal),
  ])
  signal?.throwIfAborted()
  const marketDateDeliveries = draftIds.length
    ? await dependencies.listDeliveries(scope.ownerId, draftIds, signal)
    : []
  return {
    marketDateDeliveries,
    overallCounts,
    overallTotal: Object.values(overallCounts).reduce(
      (total, count) => total + count,
      0,
    ),
  }
}

async function getNewsletterWebhookOutboxHealth(
  scope: NewsletterDraftScope,
  signal?: AbortSignal,
  now = new Date(),
): Promise<NewsletterOperationsWebhookHealth> {
  signal?.throwIfAborted()
  const configuration = getNewsletterWebhookConfiguration()
  const base = {
    configured: configuration.configured,
    configurationError: configuration.configured
      ? null
      : configuration.error,
    missing: configuration.configured ? [] : configuration.missing,
    pending: 0,
    delivering: 0,
    delivered: 0,
    errors: 0,
    oldestDueAt: null,
    lastError: null,
    lastErrorAt: null,
    queryError: null,
  } satisfies NewsletterOperationsWebhookHealth
  const scopeKey = getNewsletterDailyScopeKey(scope)
  const supabase = createServiceRoleClient()

  async function countRows(input: {
    status?: 'pending' | 'delivering' | 'delivered'
    withErrors?: boolean
  }): Promise<number> {
    let query = supabase
      .from('newsletter_webhook_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('scope_key', scopeKey)
    if (input.status) query = query.eq('status', input.status)
    if (input.withErrors) query = query.not('last_error', 'is', null)
    if (signal) query = query.abortSignal(signal)
    const result = await query
    if (result.error) throw result.error
    return result.count ?? 0
  }

  try {
    let oldestDueQuery = supabase
      .from('newsletter_webhook_outbox')
      .select('next_attempt_at')
      .eq('scope_key', scopeKey)
      .is('delivered_at', null)
      .lte('next_attempt_at', now.toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(1)
    let latestErrorQuery = supabase
      .from('newsletter_webhook_outbox')
      .select('last_error,last_attempt_at,updated_at')
      .eq('scope_key', scopeKey)
      .not('last_error', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (signal) {
      oldestDueQuery = oldestDueQuery.abortSignal(signal)
      latestErrorQuery = latestErrorQuery.abortSignal(signal)
    }
    const [pending, delivering, delivered, errors, oldestDue, latestError] =
      await Promise.all([
        countRows({ status: 'pending' }),
        countRows({ status: 'delivering' }),
        countRows({ status: 'delivered' }),
        countRows({ withErrors: true }),
        oldestDueQuery,
        latestErrorQuery,
      ])
    if (oldestDue.error) throw oldestDue.error
    if (latestError.error) throw latestError.error
    signal?.throwIfAborted()
    const errorRow = latestError.data?.[0]
    return {
      ...base,
      pending,
      delivering,
      delivered,
      errors,
      oldestDueAt: oldestDue.data?.[0]?.next_attempt_at ?? null,
      lastError: errorRow?.last_error ?? null,
      lastErrorAt: errorRow
        ? errorRow.last_attempt_at ?? errorRow.updated_at
        : null,
    }
  } catch (error) {
    signal?.throwIfAborted()
    return {
      ...base,
      queryError: errorMessage(error),
    }
  }
}

export async function getNewsletterOperationsSnapshot(
  userId: string,
  signal?: AbortSignal,
): Promise<NewsletterOperationsSnapshot> {
  signal?.throwIfAborted()
  const scope = resolveOperatorScope(userId)
  const clock = getNewsletterAutomationClock()
  const marketDate = clock.marketDate

  const [
    settings,
    morning,
    midMorning,
    dailyRun,
    notifications,
    morningHistory,
    midMorningHistory,
    integration,
    beehiivData,
    webhook,
  ] = await Promise.all([
    getNewsletterDailySettings(scope, signal),
    getNewsletterDailyAutomationRun(marketDate, signal),
    getNewsletterMidMorningRun(marketDate, signal),
    getLatestNewsletterDailyRun(scope, marketDate, signal),
    listNewsletterNotifications(scope, { limit: 24 }, signal),
    listNewsletterDailyAutomationRuns(7, signal),
    listNewsletterMidMorningRuns(7, signal),
    scope.ownerId
      ? getBeehiivIntegrationStatus(scope.ownerId, signal)
      : Promise.resolve(emptyIntegration()),
    loadNewsletterOperationsBeehiivData(scope, marketDate, signal),
    getNewsletterWebhookOutboxHealth(scope, signal),
  ])

  signal?.throwIfAborted()
  const generatedAt = new Date()
  const { marketDateDeliveries, overallCounts, overallTotal } = beehiivData
  const marketDateCounts = countDeliveryLifecycle(marketDateDeliveries)
  const staleBefore = generatedAt.getTime() - 20 * 60_000
  const staleCount = marketDateDeliveries.filter((delivery) => {
    if (
      !['draft', 'scheduled', 'unknown'].includes(delivery.lifecycleStatus)
    ) {
      return false
    }
    if (!delivery.lastReconciledAt) return true
    return new Date(delivery.lastReconciledAt).getTime() < staleBefore
  }).length

  const exceptions =
    dailyRun?.items
      .filter(
        (item) =>
          item.status === 'failed' ||
          item.status === 'needs_attention' ||
          item.retryCount > 0,
      )
      .map((item) => ({
        id: item.id,
        ticker: item.ticker,
        status: item.status,
        retryCount: item.retryCount,
        errorMessage: item.errorMessage,
        draftId: item.draftId,
      })) ?? []

  return {
    generatedAt: generatedAt.toISOString(),
    marketDate,
    clock,
    windows: {
      morning: getNewsletterAutomationWindow(clock, [
        settings.generationHour,
      ]),
      midMorning: getMidMorningAutomationWindow(clock),
    },
    settings,
    webhookConfigured: webhook.configured,
    webhook,
    morning: morning ? mapMorningRun(morning) : null,
    midMorning: midMorning ? mapMidMorningRun(midMorning) : null,
    dailyRun: dailyRun
      ? {
          id: dailyRun.id,
          status: dailyRun.status,
          targetCount: dailyRun.targetCount,
          selectedCount: dailyRun.selectedCount,
          generatedCount: dailyRun.generatedCount,
          readyCount: dailyRun.readyCount,
          attentionCount: dailyRun.attentionCount,
          failedCount: dailyRun.failedCount,
          startedAt: dailyRun.startedAt,
          completedAt: dailyRun.completedAt,
          exceptions,
        }
      : null,
    notifications,
    beehiiv: {
      integration,
      marketDateCounts,
      overallCounts,
      overallTotal,
      reconcileErrors: marketDateDeliveries.filter(
        (delivery) =>
          Boolean(delivery.lastReconcileError || delivery.statsLastError),
      ).length,
      staleCount,
      lifecycle: summarizeBeehiivLifecycle(
        marketDateDeliveries,
        generatedAt,
      ),
      stats: aggregateBeehiivStats(marketDateDeliveries),
      deliveries: marketDateDeliveries
        .slice(0, NEWSLETTER_OPERATIONS_DELIVERY_DISPLAY_LIMIT)
        .map((delivery) => ({
          id: delivery.id,
          draftId: delivery.draftId,
          title: delivery.title,
          editorUrl: delivery.editorUrl,
          webUrl: delivery.webUrl,
          lifecycleStatus: delivery.lifecycleStatus,
          beehiivStatus: delivery.beehiivStatus,
          scheduledAt: delivery.scheduledAt,
          publishedAt: delivery.publishedAt,
          syncedAt: delivery.syncedAt,
          lastReconciledAt: delivery.lastReconciledAt,
          lastReconcileError: delivery.lastReconcileError,
          statsLastFetchedAt: delivery.statsLastFetchedAt,
          statsLastError: delivery.statsLastError,
          stats: normalizeBeehiivStats(delivery.stats),
        })),
    },
    history: [
      ...morningHistory.map(mapMorningRun),
      ...midMorningHistory.map(mapMidMorningRun),
    ].sort((left, right) => {
      return right.marketDate.localeCompare(left.marketDate)
    }),
  }
}

export const __testOnly = {
  NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT,
  aggregateBeehiivStats,
  countDeliveryLifecycle,
  listNewsletterOperationsMarketDateDraftIds,
  loadNewsletterOperationsBeehiivData,
  getNewsletterWebhookOutboxHealth,
  mapMorningRun,
  mapMidMorningRun,
  normalizeBeehiivStats,
  retryDetails,
  resolveOperatorScope,
  summarizeBeehiivLifecycle,
}
