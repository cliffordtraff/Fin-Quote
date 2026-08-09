import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Database } from '@/lib/database.types'
import { beehiivDeliveryNeedsSync } from '@/lib/beehiiv/sync-freshness'
import {
  DEFAULT_NEWSLETTER_DAILY_TARGET,
  MAX_NEWSLETTER_DAILY_TARGET,
} from './daily-target'
import type {
  NewsletterDailyAutomationRun,
  NewsletterDailyAutomationStage,
  NewsletterDailyAutomationStatus,
} from './daily-automation'
import type {
  NewsletterDailyBeehiivDelivery,
  NewsletterDailyItemStatus,
  NewsletterDailyQualityBand,
  NewsletterDailyRun,
  NewsletterDailyRunItem,
  NewsletterDailyRunStatus,
  NewsletterDailySettings,
  NewsletterDailySourceRef,
} from './daily-types'
import type { NewsletterDraftStatus } from './types'

const SETTINGS_TABLE = 'newsletter_daily_settings'
const RUNS_TABLE = 'newsletter_daily_runs'
const ITEMS_TABLE = 'newsletter_daily_run_items'
const AUTOMATION_TABLE = 'newsletter_daily_automation_runs'

const SETTINGS_SELECT = 'enabled,target_count,timezone,generation_hour'
const RUN_SELECT =
  'id,market_date,status,target_count,source_wiim_run_id,source_generated_at,selected_count,generated_count,ready_count,attention_count,failed_count,error_message,metadata_json,started_at,completed_at,created_at,updated_at'
const ITEM_SELECT =
  'id,run_id,rank,ticker,status,quality_band,relevance_score,confidence_score,candidate_type,state_label,move_percent,reason_type,headline,summary_text,key_fact,source_refs_json,candidate_json,draft_id,draft_status,chart_id,chart_image_url,subject_line,error_message,retry_count,started_at,completed_at,created_at,updated_at'
const DRAFT_STATE_SELECT = 'id,status,subject_line,updated_at'
const DELIVERY_STATE_SELECT =
  'id,draft_id,beehiiv_post_id,preview_url,editor_url,web_url,lifecycle_status,beehiiv_status,scheduled_at,published_at,synced_at,last_reconciled_at,last_reconcile_error,source_draft_updated_at'
const AUTOMATION_SELECT =
  'id,market_date,status,stage,candidate_symbols,candidate_count,finviz_completed_count,finviz_found_count,finviz_error_count,summary_completed_count,summary_generated_count,summary_no_result_count,summary_error_count,wiim_run_id,newsletter_scope_count,newsletter_completed_scope_count,newsletter_selected_count,newsletter_generated_count,newsletter_ready_count,newsletter_attention_count,newsletter_failed_count,invocation_count,last_error,notification_applied_at,notification_attempt_count,notification_last_error,metadata_json,started_at,completed_at,last_heartbeat_at,created_at,updated_at'

type DailySettingsRow =
  Database['public']['Tables']['newsletter_daily_settings']['Row']
type DailyRunRow = Database['public']['Tables']['newsletter_daily_runs']['Row']
type DailyItemRow =
  Database['public']['Tables']['newsletter_daily_run_items']['Row']
type AutomationRow =
  Database['public']['Tables']['newsletter_daily_automation_runs']['Row']

interface DraftStateRow {
  id: string
  session_id?: string
  status: string
  subject_line: string
  updated_at: string
}

function sanitizeLocalStorageKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Draft storage key is required')
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getLocalDraftStatePath(scope: NewsletterDailyReadScope, id: string) {
  // Compose the runtime-only directory name so Next's file tracer does not
  // package local developer draft contents into a production function.
  const localDraftDirectory = ['.newsletter', 'drafts'].join('-')
  return resolve(
    process.cwd(),
    localDraftDirectory,
    sanitizeLocalStorageKey(scope.sessionId),
    `${sanitizeLocalStorageKey(id)}.json`,
  )
}

async function readLocalDraftStates(
  scope: NewsletterDailyReadScope,
  draftIds: string[],
  signal?: AbortSignal,
): Promise<DraftStateRow[]> {
  return (await Promise.all(draftIds.map(async (id) => {
    signal?.throwIfAborted()
    try {
      const serialized = await readFile(getLocalDraftStatePath(scope, id), {
        encoding: 'utf8',
        signal,
      })
      const row = JSON.parse(serialized) as DraftStateRow
      return row.session_id === scope.sessionId ? row : null
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      const code = isRecord(error) ? error.code : null
      if (code !== 'ENOENT') {
        console.error(
          `[newsletter-daily-runs] Skipping unreadable local draft ${id}:`,
          error,
        )
      }
      return null
    }
  }))).filter((row): row is DraftStateRow => Boolean(row))
}

interface DeliveryStateRow {
  id: string
  draft_id: string
  beehiiv_post_id: string
  preview_url: string | null
  editor_url: string
  web_url: string | null
  lifecycle_status: string
  beehiiv_status: string | null
  scheduled_at: string | null
  published_at: string | null
  synced_at: string
  last_reconciled_at: string | null
  last_reconcile_error: string | null
  source_draft_updated_at: string | null
}

export interface NewsletterDailyReadScope {
  ownerId: string | null
  sessionId: string
}

export class NewsletterDailyRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Newsletter daily run not found: ${id}`)
    this.name = 'NewsletterDailyRunNotFoundError'
  }
}

function getServiceClient(purpose: 'daily runs' | 'automation') {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      purpose === 'automation'
        ? 'Missing Supabase service role configuration for newsletter automation'
        : 'Missing Supabase service role configuration for newsletter daily runs',
    )
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function asSourceRefs(value: unknown): NewsletterDailySourceRef[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const kind = typeof entry.kind === 'string' ? entry.kind : ''
    const label = typeof entry.label === 'string' ? entry.label : ''
    if (!kind || !label) return []
    return [{
      kind,
      label,
      url: typeof entry.url === 'string' ? entry.url : undefined,
      publishedAt:
        typeof entry.publishedAt === 'string' ? entry.publishedAt : undefined,
    }]
  })
}

export function getNewsletterDailyScopeKey(
  scope: NewsletterDailyReadScope,
): string {
  return scope.ownerId
    ? `owner:${scope.ownerId}`
    : `session:${scope.sessionId}`
}

export function getConfiguredNewsletterAutomationScope(): NewsletterDailyReadScope | null {
  const ownerId = process.env.NEWSLETTER_AUTOMATION_OWNER_ID?.trim() || null
  const sessionId =
    process.env.NEWSLETTER_AUTOMATION_SESSION_ID?.trim() ||
    'newsletter-daily-automation'
  if (!ownerId && !process.env.NEWSLETTER_AUTOMATION_SESSION_ID?.trim()) {
    return null
  }
  return { ownerId, sessionId }
}

export function mapSettingsRow(
  row: DailySettingsRow,
): NewsletterDailySettings {
  return {
    enabled: row.enabled,
    targetCount: row.target_count,
    timezone: row.timezone,
    generationHour: row.generation_hour,
  }
}

export function defaultNewsletterDailySettings(): NewsletterDailySettings {
  return {
    enabled: true,
    targetCount: DEFAULT_NEWSLETTER_DAILY_TARGET,
    timezone: 'America/New_York',
    generationHour: 8,
  }
}

export function mapItemRow(row: DailyItemRow): NewsletterDailyRunItem {
  return {
    id: row.id,
    runId: row.run_id,
    rank: row.rank,
    ticker: row.ticker,
    status: row.status as NewsletterDailyItemStatus,
    qualityBand: row.quality_band as NewsletterDailyQualityBand,
    relevanceScore: Number(row.relevance_score),
    confidenceScore: Number(row.confidence_score),
    candidateType: row.candidate_type,
    stateLabel: row.state_label,
    movePercent: row.move_percent == null ? null : Number(row.move_percent),
    reasonType: row.reason_type,
    headline: row.headline,
    summaryText: row.summary_text,
    keyFact: row.key_fact,
    sourceRefs: asSourceRefs(row.source_refs_json),
    candidateMetadata: isRecord(row.candidate_json) ? row.candidate_json : {},
    draftId: row.draft_id,
    draftStatus: row.draft_status as NewsletterDraftStatus | null,
    chartId: row.chart_id,
    chartImageUrl: row.chart_image_url,
    subjectLine: row.subject_line,
    beehiivDelivery: null,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapRunRow(
  row: DailyRunRow,
  items: NewsletterDailyRunItem[],
): NewsletterDailyRun {
  return {
    id: row.id,
    marketDate: row.market_date,
    edition: 'morning',
    status: row.status as NewsletterDailyRunStatus,
    targetCount: row.target_count,
    sourceWiimRunId: row.source_wiim_run_id,
    sourceGeneratedAt: row.source_generated_at,
    selectedCount: row.selected_count,
    generatedCount: row.generated_count,
    readyCount: row.ready_count,
    attentionCount: row.attention_count,
    failedCount: row.failed_count,
    errorMessage: row.error_message,
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  }
}

function mapAutomationRow(row: AutomationRow): NewsletterDailyAutomationRun {
  return {
    id: row.id,
    marketDate: row.market_date,
    status: row.status as NewsletterDailyAutomationStatus,
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

function mapDeliveryState(
  row: DeliveryStateRow,
  draftUpdatedAt: string,
): NewsletterDailyBeehiivDelivery {
  return {
    id: row.id,
    postId: row.beehiiv_post_id,
    editorUrl: row.editor_url,
    previewUrl: row.preview_url,
    webUrl: row.web_url,
    lifecycleStatus:
      row.lifecycle_status as NewsletterDailyBeehiivDelivery['lifecycleStatus'],
    beehiivStatus: row.beehiiv_status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    syncedAt: row.synced_at,
    lastReconciledAt: row.last_reconciled_at,
    lastReconcileError: row.last_reconcile_error,
    needsSync: beehiivDeliveryNeedsSync(draftUpdatedAt, {
      sourceDraftUpdatedAt: row.source_draft_updated_at,
      syncedAt: row.synced_at,
    }),
  }
}

async function syncItemDraftStates(
  scope: NewsletterDailyReadScope,
  items: NewsletterDailyRunItem[],
  signal?: AbortSignal,
): Promise<NewsletterDailyRunItem[]> {
  signal?.throwIfAborted()
  const draftIds = [...new Set(items.flatMap((item) =>
    item.draftId ? [item.draftId] : [],
  ))]
  if (draftIds.length === 0) return items

  if (!scope.ownerId) {
    const localDrafts = await readLocalDraftStates(scope, draftIds, signal)
    const draftsById = new Map(
      localDrafts.map((draft) => [draft.id, draft]),
    )
    return applyDraftStates(items, draftsById, new Map())
  }

  const supabase = getServiceClient('daily runs')
  let draftQuery = supabase
    .from('newsletter_drafts')
    .select(DRAFT_STATE_SELECT)
    .in('id', draftIds)
    .limit(MAX_NEWSLETTER_DAILY_TARGET)
  draftQuery = scope.ownerId
    ? draftQuery.eq('owner_id', scope.ownerId)
    : draftQuery.is('owner_id', null).eq('session_id', scope.sessionId)
  if (signal) draftQuery = draftQuery.abortSignal(signal)

  let deliveryQuery = supabase
    .from('newsletter_beehiiv_deliveries')
    .select(DELIVERY_STATE_SELECT)
    .eq('owner_id', scope.ownerId)
    .in('draft_id', draftIds)
    .limit(MAX_NEWSLETTER_DAILY_TARGET)
  if (signal) {
    deliveryQuery = deliveryQuery.abortSignal(signal)
  }

  const [draftResult, deliveryResult] = await Promise.all([
    draftQuery,
    deliveryQuery,
  ])
  if (draftResult.error) {
    throw new Error(
      `Failed to look up newsletter drafts: ${draftResult.error.message}`,
    )
  }
  if (deliveryResult.error) {
    throw new Error(
      `Failed to load Beehiiv deliveries: ${deliveryResult.error.message}`,
    )
  }

  const draftsById = new Map(
    ((draftResult.data ?? []) as DraftStateRow[]).map((draft) => [
      draft.id,
      draft,
    ]),
  )
  const deliveriesByDraftId = new Map(
    ((deliveryResult.data ?? []) as DeliveryStateRow[]).map((delivery) => [
      delivery.draft_id,
      delivery,
    ]),
  )

  return applyDraftStates(items, draftsById, deliveriesByDraftId)
}

function applyDraftStates(
  items: NewsletterDailyRunItem[],
  draftsById: Map<string, DraftStateRow>,
  deliveriesByDraftId: Map<string, DeliveryStateRow>,
): NewsletterDailyRunItem[] {
  return items.map((item) => {
    const draft = item.draftId ? draftsById.get(item.draftId) : null
    if (!draft) return item
    const deliveryRow = deliveriesByDraftId.get(draft.id)
    const beehiivDelivery = deliveryRow
      ? mapDeliveryState(deliveryRow, draft.updated_at)
      : null
    const status: NewsletterDailyItemStatus =
      draft.status === 'published' ||
      beehiivDelivery?.lifecycleStatus === 'published'
        ? 'published'
        : draft.status === 'ready'
          ? 'ready'
          : item.status

    return {
      ...item,
      status,
      draftStatus: draft.status as NewsletterDraftStatus,
      draftUpdatedAt: draft.updated_at,
      subjectLine: draft.subject_line,
      beehiivDelivery,
    }
  })
}

/**
 * Hydrates one already-scoped run row through a bounded item/read-state graph.
 * Keep this seam separate so a future shortlist revision can be joined without
 * moving persistence logic into the route handler.
 */
export async function hydrateNewsletterDailyRun(
  scope: NewsletterDailyReadScope,
  row: DailyRunRow,
  signal?: AbortSignal,
): Promise<NewsletterDailyRun> {
  signal?.throwIfAborted()
  const supabase = getServiceClient('daily runs')
  let itemsQuery = supabase
    .from(ITEMS_TABLE)
    .select(ITEM_SELECT)
    .eq('run_id', row.id)
    .order('rank', { ascending: true })
    .limit(MAX_NEWSLETTER_DAILY_TARGET)
  if (signal) itemsQuery = itemsQuery.abortSignal(signal)
  const { data, error } = await itemsQuery
  if (error) {
    throw new Error(`Failed to load newsletter daily run: ${error.message}`)
  }

  const items = await syncItemDraftStates(
    scope,
    ((data ?? []) as DailyItemRow[]).map(mapItemRow),
    signal,
  )
  return mapRunRow(row, items)
}

export async function getNewsletterDailySettings(
  scope: NewsletterDailyReadScope,
  signal?: AbortSignal,
): Promise<NewsletterDailySettings> {
  signal?.throwIfAborted()
  const supabase = getServiceClient('daily runs')
  let query = supabase
    .from(SETTINGS_TABLE)
    .select(SETTINGS_SELECT)
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to load newsletter daily settings: ${error.message}`)
  }
  return data
    ? mapSettingsRow(data as DailySettingsRow)
    : defaultNewsletterDailySettings()
}

export async function getNewsletterDailyRun(
  scope: NewsletterDailyReadScope,
  id: string,
  signal?: AbortSignal,
): Promise<NewsletterDailyRun> {
  signal?.throwIfAborted()
  const supabase = getServiceClient('daily runs')
  let query = supabase
    .from(RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('id', id)
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to load newsletter daily run: ${error.message}`)
  }
  if (!data) throw new NewsletterDailyRunNotFoundError(id)
  return hydrateNewsletterDailyRun(scope, data as DailyRunRow, signal)
}

export async function getLatestNewsletterDailyRun(
  scope: NewsletterDailyReadScope,
  marketDate?: string,
  signal?: AbortSignal,
): Promise<NewsletterDailyRun | null> {
  signal?.throwIfAborted()
  const supabase = getServiceClient('daily runs')
  let query = supabase
    .from(RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .order('market_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (marketDate) query = query.eq('market_date', marketDate)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to find newsletter daily run: ${error.message}`)
  }
  return data
    ? hydrateNewsletterDailyRun(scope, data as DailyRunRow, signal)
    : null
}

export async function getNewsletterDailyAutomationRun(
  marketDate?: string,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun | null> {
  signal?.throwIfAborted()
  const supabase = getServiceClient('automation')
  let query = supabase
    .from(AUTOMATION_TABLE)
    .select(AUTOMATION_SELECT)
    .order('market_date', { ascending: false })
    .limit(1)
  if (marketDate) query = query.eq('market_date', marketDate)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load newsletter automation: ${error.message}`)
  }
  return data ? mapAutomationRow(data as AutomationRow) : null
}

export const __testOnly = {
  settingsSelect: SETTINGS_SELECT,
  runSelect: RUN_SELECT,
  itemSelect: ITEM_SELECT,
  draftStateSelect: DRAFT_STATE_SELECT,
  deliveryStateSelect: DELIVERY_STATE_SELECT,
  automationSelect: AUTOMATION_SELECT,
  mapAutomationRow,
  readLocalDraftStates,
  syncItemDraftStates,
}
