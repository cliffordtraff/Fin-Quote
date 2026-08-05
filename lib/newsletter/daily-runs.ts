import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { listBeehiivDeliveries } from '@/lib/beehiiv/store'
import { WIIM_SUMMARY_CONFIG_VERSION } from '@/lib/generated-stock-why-moving'
import {
  appendNewsletterDraftEvent,
  createNewsletterDraftFromDocument,
  findNewsletterDraftBySourceReviewKey,
  getNewsletterDraft,
  listNewsletterDrafts,
  saveNewsletterDraft,
  type NewsletterDraftScope,
} from './drafts'
import {
  listNewsletterChartLibraryItems,
  saveNewsletterChartLibraryItem,
  type NewsletterChartLibraryItem,
} from './chart-library'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
} from './charting-platform-export'
import { buildDailyNewsletterDraft } from './daily-draft'
import {
  selectDailyNewsletterCandidates,
  type DailyGeneratedSummaryRow,
  type DailyWiimCandidateRow,
} from './daily-selection'
import {
  DEFAULT_NEWSLETTER_DAILY_TARGET,
  MAX_NEWSLETTER_DAILY_TARGET,
  MIN_NEWSLETTER_DAILY_TARGET,
  clampNewsletterDailyTarget,
  resolveExistingRunTarget,
} from './daily-target'
import type {
  NewsletterDailyCandidate,
  NewsletterDailyItemStatus,
  NewsletterDailyProcessingResult,
  NewsletterDailyQualityBand,
  NewsletterDailyRun,
  NewsletterDailyRunItem,
  NewsletterDailyRunStatus,
  NewsletterDailySettings,
  NewsletterDailySourceRef,
  NewsletterDailyBeehiivDelivery,
} from './daily-types'
import type {
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftStatus,
} from './types'
import { canSetNewsletterDraftStatus } from './workflow'

const SETTINGS_TABLE = 'newsletter_daily_settings'
const RUNS_TABLE = 'newsletter_daily_runs'
const ITEMS_TABLE = 'newsletter_daily_run_items'
const STALE_GENERATION_MINUTES = 15
export const MAX_NEWSLETTER_DAILY_ITEM_RETRIES = 3

type DailySettingsRow =
  Database['public']['Tables']['newsletter_daily_settings']['Row']
type DailyRunRow = Database['public']['Tables']['newsletter_daily_runs']['Row']
type DailyItemRow =
  Database['public']['Tables']['newsletter_daily_run_items']['Row']

interface SourceWiimRunRow {
  id: string
  started_at: string
  completed_at: string | null
  metadata_json: unknown
}

interface DailyRunDependencies {
  listCharts?: (
    scope: NewsletterDraftScope,
  ) => Promise<NewsletterChartLibraryItem[]>
  createChart?: (
    scope: NewsletterDraftScope,
    item: NewsletterDailyRunItem,
    options: DailyProcessOptions,
  ) => Promise<NewsletterChartLibraryItem>
}

export interface DailyProcessOptions {
  limit?: number
  concurrency?: number
  retryFailed?: boolean
  chartBaseUrl?: string
  publicChartBaseUrl?: string
}

export class NewsletterDailyRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Newsletter daily run not found: ${id}`)
    this.name = 'NewsletterDailyRunNotFoundError'
  }
}

export class NewsletterDailySourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterDailySourceError'
  }
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration for newsletter daily runs',
    )
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function getNewsletterDailyScopeKey(
  scope: NewsletterDraftScope,
): string {
  return scope.ownerId
    ? `owner:${scope.ownerId}`
    : `session:${scope.sessionId}`
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

export { clampNewsletterDailyTarget } from './daily-target'

function toEasternDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('Could not resolve the current New York market date')
  }
  return `${year}-${month}-${day}`
}

function nextIsoDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function getTimeZoneOffsetMinutes(date: string, timeZone: string): number {
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')
    ?.value
  const match = offsetName?.match(/^GMT([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

function getEasternDateBounds(date: string) {
  const nextDate = nextIsoDate(date)
  const startOffset = getTimeZoneOffsetMinutes(date, 'America/New_York')
  const endOffset = getTimeZoneOffsetMinutes(nextDate, 'America/New_York')
  return {
    start: new Date(
      Date.parse(`${date}T00:00:00Z`) - startOffset * 60_000,
    ).toISOString(),
    end: new Date(
      Date.parse(`${nextDate}T00:00:00Z`) - endOffset * 60_000,
    ).toISOString(),
  }
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

function mapSettingsRow(row: DailySettingsRow): NewsletterDailySettings {
  return {
    enabled: row.enabled,
    targetCount: row.target_count,
    timezone: row.timezone,
    generationHour: row.generation_hour,
  }
}

function mapItemRow(row: DailyItemRow): NewsletterDailyRunItem {
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
    movePercent:
      row.move_percent == null ? null : Number(row.move_percent),
    reasonType: row.reason_type,
    headline: row.headline,
    summaryText: row.summary_text,
    keyFact: row.key_fact,
    sourceRefs: asSourceRefs(row.source_refs_json),
    candidateMetadata: isRecord(row.candidate_json)
      ? row.candidate_json
      : {},
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

function mapRunRow(
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

async function loadSourceUniverse(
  marketDate: string,
  targetCount: number,
): Promise<{
  run: SourceWiimRunRow
  candidates: NewsletterDailyCandidate[]
  candidateCount: number
  summaryCount: number
}> {
  const supabase = getServiceClient()
  const bounds = getEasternDateBounds(marketDate)
  const { data: runRows, error: runError } = await supabase
    .from('wiim_runs')
    .select('id, started_at, completed_at, metadata_json')
    .eq('run_type', 'morning')
    .eq('status', 'completed')
    .gte('started_at', bounds.start)
    .lt('started_at', bounds.end)
    .order('started_at', { ascending: false })
    .limit(12)

  if (runError) {
    throw new NewsletterDailySourceError(
      `Could not load today's WIIM runs: ${runError.message}`,
    )
  }

  let sourceRun: SourceWiimRunRow | null = null
  let candidateRows: DailyWiimCandidateRow[] = []
  for (const run of (runRows ?? []) as SourceWiimRunRow[]) {
    const { data, error } = await supabase
      .from('wiim_run_candidates')
      .select(
        'id, wiim_run_id, rank, ticker, headline, why_it_matters, confidence_score, candidate_type, state_label, signals_json, source_refs_json, metadata_json',
      )
      .eq('wiim_run_id', run.id)
      .order('rank', { ascending: true })

    if (error) {
      throw new NewsletterDailySourceError(
        `Could not load WIIM candidates: ${error.message}`,
      )
    }
    if ((data?.length ?? 0) >= MIN_NEWSLETTER_DAILY_TARGET) {
      sourceRun = run
      candidateRows = (data ?? []) as DailyWiimCandidateRow[]
      break
    }
  }

  if (!sourceRun) {
    throw new NewsletterDailySourceError(
      `Today's WIIM run has not persisted the full candidate universe yet. Run "npm run wiim:brief -- --run-type morning --compare-latest" first.`,
    )
  }

  const symbols = candidateRows
    .map((row) => row.ticker)
    .filter((symbol): symbol is string => Boolean(symbol))
  const { data: summaryRows, error: summaryError } = await supabase
    .from('stock_summaries')
    .select(
      'symbol, summary_text, no_summary_reason, generated_at, model, run_id, winning_event, metadata',
    )
    .eq('summary_date', marketDate)
    .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
    .in('symbol', symbols)
    .order('generated_at', { ascending: false })
    .limit(5000)

  if (summaryError) {
    throw new NewsletterDailySourceError(
      `Could not load generated WIIM summaries: ${summaryError.message}`,
    )
  }

  const candidates = selectDailyNewsletterCandidates({
    candidateRows,
    summaryRows: (summaryRows ?? []) as DailyGeneratedSummaryRow[],
    marketDate,
    targetCount,
  })

  if (candidates.length < targetCount) {
    throw new NewsletterDailySourceError(
      `Only ${candidates.length} candidates passed the current-news quality gate; ${targetCount} are required for this run.`,
    )
  }

  return {
    run: sourceRun,
    candidates,
    candidateCount: candidateRows.length,
    summaryCount: summaryRows?.filter((row) => Boolean(row.summary_text)).length ?? 0,
  }
}

export async function getNewsletterDailySettings(
  scope: NewsletterDraftScope,
): Promise<NewsletterDailySettings> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load newsletter daily settings: ${error.message}`)
  }
  if (!data) {
    return {
      enabled: true,
      targetCount: DEFAULT_NEWSLETTER_DAILY_TARGET,
      timezone: 'America/New_York',
      generationHour: 8,
    }
  }
  return mapSettingsRow(data as DailySettingsRow)
}

export async function saveNewsletterDailySettings(
  scope: NewsletterDraftScope,
  input: Partial<NewsletterDailySettings>,
): Promise<NewsletterDailySettings> {
  const current = await getNewsletterDailySettings(scope)
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(
      {
        scope_key: getNewsletterDailyScopeKey(scope),
        owner_id: scope.ownerId,
        session_id: scope.sessionId,
        enabled: input.enabled ?? current.enabled,
        target_count: clampNewsletterDailyTarget(
          input.targetCount ?? current.targetCount,
        ),
        timezone: input.timezone?.trim() || current.timezone,
        generation_hour: Math.max(
          0,
          Math.min(
            23,
            Math.floor(input.generationHour ?? current.generationHour),
          ),
        ),
      },
      { onConflict: 'scope_key' },
    )
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to save newsletter daily settings: ${error?.message ?? 'unknown error'}`,
    )
  }
  return mapSettingsRow(data as DailySettingsRow)
}

async function syncItemDraftStates(
  scope: NewsletterDraftScope,
  items: NewsletterDailyRunItem[],
): Promise<NewsletterDailyRunItem[]> {
  if (!items.some((item) => item.draftId)) return items
  const draftIds = items.flatMap((item) =>
    item.draftId ? [item.draftId] : [],
  )
  const [summaries, deliveries] = await Promise.all([
    listNewsletterDrafts(scope),
    scope.ownerId
      ? listBeehiivDeliveries(scope.ownerId, draftIds)
      : Promise.resolve([]),
  ])
  const byId = new Map(summaries.map((draft) => [draft.id, draft]))
  const deliveriesByDraft = new Map(
    deliveries.map((delivery) => [delivery.draftId, delivery]),
  )
  return items.map((item) => {
    const draft = item.draftId ? byId.get(item.draftId) : null
    if (!draft) return item
    const delivery = deliveriesByDraft.get(draft.id)
    const beehiivDelivery: NewsletterDailyBeehiivDelivery | null = delivery
      ? {
          id: delivery.id,
          postId: delivery.postId,
          editorUrl: delivery.editorUrl,
          previewUrl: delivery.previewUrl,
          webUrl: delivery.webUrl,
          lifecycleStatus: delivery.lifecycleStatus,
          beehiivStatus: delivery.beehiivStatus,
          scheduledAt: delivery.scheduledAt,
          publishedAt: delivery.publishedAt,
          syncedAt: delivery.syncedAt,
          lastReconciledAt: delivery.lastReconciledAt,
          lastReconcileError: delivery.lastReconcileError,
          needsSync:
            new Date(draft.updatedAt).getTime() >
            new Date(delivery.syncedAt).getTime(),
        }
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
      draftStatus: draft.status,
      subjectLine: draft.subjectLine,
      beehiivDelivery,
    }
  })
}

export async function getNewsletterDailyRun(
  scope: NewsletterDraftScope,
  id: string,
): Promise<NewsletterDailyRun> {
  const supabase = getServiceClient()
  const scopeKey = getNewsletterDailyScopeKey(scope)
  const [{ data: run, error: runError }, { data: itemRows, error: itemError }] =
    await Promise.all([
      supabase
        .from(RUNS_TABLE)
        .select('*')
        .eq('id', id)
        .eq('scope_key', scopeKey)
        .maybeSingle(),
      supabase
        .from(ITEMS_TABLE)
        .select('*')
        .eq('run_id', id)
        .order('rank', { ascending: true }),
    ])

  if (runError || itemError) {
    throw new Error(
      `Failed to load newsletter daily run: ${
        runError?.message ?? itemError?.message
      }`,
    )
  }
  if (!run) throw new NewsletterDailyRunNotFoundError(id)

  const items = await syncItemDraftStates(
    scope,
    ((itemRows ?? []) as DailyItemRow[]).map(mapItemRow),
  )
  return mapRunRow(run as DailyRunRow, items)
}

export async function getLatestNewsletterDailyRun(
  scope: NewsletterDraftScope,
  marketDate?: string,
): Promise<NewsletterDailyRun | null> {
  const supabase = getServiceClient()
  let query = supabase
    .from(RUNS_TABLE)
    .select('id')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
    .order('market_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (marketDate) query = query.eq('market_date', marketDate)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to find newsletter daily run: ${error.message}`)
  }
  return data ? getNewsletterDailyRun(scope, data.id) : null
}

function candidateItemPayload(
  runId: string,
  candidate: NewsletterDailyCandidate,
  rank: number,
) {
  return {
    id: crypto.randomUUID(),
    run_id: runId,
    rank,
    ticker: candidate.ticker,
    status: 'queued',
    quality_band: candidate.qualityBand,
    relevance_score: candidate.relevanceScore,
    confidence_score: candidate.confidenceScore,
    candidate_type: candidate.candidateType,
    state_label: candidate.stateLabel,
    move_percent: candidate.movePercent,
    reason_type: candidate.reasonType,
    headline: candidate.headline,
    summary_text: candidate.summaryText,
    key_fact: candidate.keyFact,
    source_refs_json: candidate.sourceRefs as unknown as Json,
    candidate_json: {
      ...candidate.candidateMetadata,
      sourceCandidateId: candidate.sourceCandidateId,
      sourceWiimRunId: candidate.sourceWiimRunId,
      companyName: candidate.companyName,
      price: candidate.price,
      change: candidate.change,
    } as Json,
  }
}

export async function ensureNewsletterDailyRun(
  scope: NewsletterDraftScope,
  options: {
    marketDate?: string
    targetCount?: number
  } = {},
): Promise<NewsletterDailyRun> {
  const marketDate = options.marketDate ?? toEasternDate()
  const settings = await saveNewsletterDailySettings(scope, {
    targetCount: options.targetCount,
  })
  const targetCount = clampNewsletterDailyTarget(
    options.targetCount ?? settings.targetCount,
  )
  const source = await loadSourceUniverse(marketDate, targetCount)
  const supabase = getServiceClient()
  const scopeKey = getNewsletterDailyScopeKey(scope)

  let { data: run, error: runError } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .eq('scope_key', scopeKey)
    .eq('market_date', marketDate)
    .eq('edition', 'morning')
    .maybeSingle()

  if (runError) {
    throw new Error(`Failed to find today's newsletter run: ${runError.message}`)
  }

  if (!run) {
    const inserted = await supabase
      .from(RUNS_TABLE)
      .insert({
        scope_key: scopeKey,
        owner_id: scope.ownerId,
        session_id: scope.sessionId,
        market_date: marketDate,
        edition: 'morning',
        status: 'queued',
        target_count: targetCount,
        source_wiim_run_id: source.run.id,
        source_generated_at:
          source.run.completed_at ?? source.run.started_at,
        selected_count: source.candidates.length,
        metadata_json: {
          sourceCandidateCount: source.candidateCount,
          currentSummaryCount: source.summaryCount,
          qualityGateVersion: 'daily-newsletters-v1',
          strongCount: source.candidates.filter(
            (candidate) => candidate.qualityBand === 'strong',
          ).length,
        },
      })
      .select('*')
      .single()
    if (inserted.error || !inserted.data) {
      throw new Error(
        `Failed to create newsletter daily run: ${
          inserted.error?.message ?? 'unknown error'
        }`,
      )
    }
    run = inserted.data
  } else {
    const updated = await supabase
      .from(RUNS_TABLE)
      .update({
        target_count: resolveExistingRunTarget(
          targetCount,
          Number(run.selected_count) || 0,
        ),
        source_wiim_run_id: source.run.id,
        source_generated_at:
          source.run.completed_at ?? source.run.started_at,
        error_message: null,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (updated.error || !updated.data) {
      throw new Error(
        `Failed to update newsletter daily run: ${
          updated.error?.message ?? 'unknown error'
        }`,
      )
    }
    run = updated.data
  }

  const { data: existingRows, error: existingError } = await supabase
    .from(ITEMS_TABLE)
    .select('ticker, rank')
    .eq('run_id', run.id)
    .order('rank', { ascending: true })
  if (existingError) {
    throw new Error(
      `Failed to inspect newsletter daily items: ${existingError.message}`,
    )
  }

  const existingTickers = new Set(
    (existingRows ?? []).map((row) => row.ticker),
  )
  const nextRank =
    (existingRows ?? []).reduce(
      (maximum, row) => Math.max(maximum, row.rank),
      0,
    ) + 1
  const additions = source.candidates
    .filter((candidate) => !existingTickers.has(candidate.ticker))
    .slice(0, Math.max(0, targetCount - existingTickers.size))
    .map((candidate, index) =>
      candidateItemPayload(run!.id, candidate, nextRank + index),
    )

  if (additions.length > 0) {
    const { error } = await supabase.from(ITEMS_TABLE).insert(additions)
    if (error) {
      throw new Error(`Failed to create newsletter daily items: ${error.message}`)
    }
  }

  await recalculateNewsletterDailyRun(run.id)
  return getNewsletterDailyRun(scope, run.id)
}

async function recalculateNewsletterDailyRun(runId: string): Promise<void> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select('status')
    .eq('run_id', runId)
  if (error) {
    throw new Error(`Failed to count newsletter daily items: ${error.message}`)
  }

  const statuses = (data ?? []).map(
    (row) => row.status as NewsletterDailyItemStatus,
  )
  const activeCount = statuses.filter(
    (status) => status === 'queued' || status === 'generating',
  ).length
  const generatedCount = statuses.filter(
    (status) =>
      status === 'generated' ||
      status === 'ready' ||
      status === 'published' ||
      status === 'needs_attention',
  ).length
  const readyCount = statuses.filter(
    (status) => status === 'ready' || status === 'published',
  ).length
  const attentionCount = statuses.filter(
    (status) => status === 'needs_attention',
  ).length
  const failedCount = statuses.filter((status) => status === 'failed').length

  let status: NewsletterDailyRunStatus = 'queued'
  if (statuses.includes('generating')) {
    status = 'generating'
  } else if (activeCount > 0) {
    status = 'queued'
  } else if (failedCount === statuses.length && statuses.length > 0) {
    status = 'failed'
  } else if (failedCount > 0 || attentionCount > 0) {
    status = 'partial'
  } else if (statuses.length > 0) {
    status = 'completed'
  }

  const terminal =
    status === 'completed' || status === 'partial' || status === 'failed'
  const { error: updateError } = await supabase
    .from(RUNS_TABLE)
    .update({
      status,
      selected_count: statuses.length,
      generated_count: generatedCount,
      ready_count: readyCount,
      attention_count: attentionCount,
      failed_count: failedCount,
      completed_at: terminal ? new Date().toISOString() : null,
    })
    .eq('id', runId)
  if (updateError) {
    throw new Error(
      `Failed to update newsletter daily counts: ${updateError.message}`,
    )
  }
}

async function recoverStaleDailyItems(runId: string) {
  const supabase = getServiceClient()
  const cutoff = new Date(
    Date.now() - STALE_GENERATION_MINUTES * 60_000,
  ).toISOString()
  const { error } = await supabase
    .from(ITEMS_TABLE)
    .update({
      status: 'queued',
      error_message: 'Recovered after an interrupted generation attempt.',
      started_at: null,
    })
    .eq('run_id', runId)
    .eq('status', 'generating')
    .lt('started_at', cutoff)
  if (error) {
    throw new Error(`Failed to recover stale newsletter items: ${error.message}`)
  }
}

function canClaimDailyItem(
  status: NewsletterDailyItemStatus,
  retryCount: number,
  retryFailed: boolean,
): boolean {
  const eligibleStatus =
    status === 'queued' ||
    (retryFailed && (status === 'failed' || status === 'needs_attention'))
  return eligibleStatus && retryCount < MAX_NEWSLETTER_DAILY_ITEM_RETRIES
}

async function claimDailyItems(
  runId: string,
  options: DailyProcessOptions,
): Promise<NewsletterDailyRunItem[]> {
  const supabase = getServiceClient()
  const eligible = options.retryFailed
    ? ['queued', 'failed', 'needs_attention']
    : ['queued']
  const limit = Math.max(
    1,
    Math.min(
      MAX_NEWSLETTER_DAILY_TARGET,
      Math.floor(options.limit ?? MAX_NEWSLETTER_DAILY_TARGET),
    ),
  )
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select('*')
    .eq('run_id', runId)
    .in('status', eligible)
    .lt('retry_count', MAX_NEWSLETTER_DAILY_ITEM_RETRIES)
    .order('retry_count', { ascending: true })
    .order('rank', { ascending: true })
    .limit(limit)
  if (error) {
    throw new Error(`Failed to find queued newsletter items: ${error.message}`)
  }

  const claimed: NewsletterDailyRunItem[] = []
  for (const row of (data ?? []) as DailyItemRow[]) {
    if (
      !canClaimDailyItem(
        row.status as NewsletterDailyItemStatus,
        row.retry_count,
        options.retryFailed === true,
      )
    ) {
      continue
    }
    const { data: claimedRow, error: claimError } = await supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'generating',
        started_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        retry_count: row.retry_count + (row.status === 'queued' ? 0 : 1),
      })
      .eq('id', row.id)
      .in('status', eligible)
      .lt('retry_count', MAX_NEWSLETTER_DAILY_ITEM_RETRIES)
      .select('*')
      .maybeSingle()
    if (claimError) {
      throw new Error(
        `Failed to claim newsletter item ${row.ticker}: ${claimError.message}`,
      )
    }
    if (claimedRow) claimed.push(mapItemRow(claimedRow as DailyItemRow))
  }
  return claimed
}

function isChartCurrent(
  chart: NewsletterChartLibraryItem,
  marketDate: string,
): boolean {
  return chart.updatedAt.slice(0, 10) >= marketDate
}

async function createDefaultDailyChart(
  scope: NewsletterDraftScope,
  item: NewsletterDailyRunItem,
  options: DailyProcessOptions,
): Promise<NewsletterChartLibraryItem> {
  const metadata = item.candidateMetadata
  const companyName =
    typeof metadata.companyName === 'string'
      ? metadata.companyName
      : typeof metadata.name === 'string'
        ? metadata.name
        : item.ticker
  return saveNewsletterChartLibraryItem(
    scope,
    {
      title: `${item.ticker} 1-Month Price Action`,
      chartExportSpec: {
        symbol: item.ticker,
        range: '1m',
        interval: 'D',
        chartType: 'candles',
        theme: 'light',
        companyName,
        renderProfile: 'newsletter',
        width: 1200,
        height: 675,
      },
    },
    {
      chartBaseUrl:
        options.chartBaseUrl ?? getDefaultChartingBaseUrl(),
      publicChartBaseUrl:
        options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl(),
      width: 1200,
      height: 675,
    },
  )
}

function mergeRepairedDailyDraft(
  existing: NewsletterDraftDocument,
  repaired: NewsletterDraftDocument,
): NewsletterDraftDocument {
  const repairedBlock = repaired.blocks[0]
  return {
    ...existing,
    source: repaired.source,
    blocks: existing.blocks.length > 0
      ? existing.blocks.map((block, index) =>
          index === 0
            ? {
                ...block,
                chartImageUrl: repairedBlock.chartImageUrl,
                chartAlt: repairedBlock.chartAlt,
                chartExportUrl: repairedBlock.chartExportUrl,
                chartSpec: repairedBlock.chartSpec,
                chartNeedsRegeneration: false,
              }
            : block,
        )
      : repaired.blocks,
  }
}

async function persistGeneratedItem(
  item: NewsletterDailyRunItem,
  draft: NewsletterDraftRecord,
  chart: NewsletterChartLibraryItem | null,
  warning: string | null,
) {
  const supabase = getServiceClient()
  const complete = Boolean(chart) && !warning
  const status: NewsletterDailyItemStatus = complete
    ? draft.status === 'ready'
      ? 'ready'
      : draft.status === 'published'
        ? 'published'
        : 'generated'
    : 'needs_attention'
  const { error } = await supabase
    .from(ITEMS_TABLE)
    .update({
      status,
      draft_id: draft.id,
      draft_status: draft.status,
      subject_line: draft.subjectLine,
      chart_id: chart?.id ?? null,
      chart_image_url:
        chart?.thumbnailUrl ??
        chart?.chartImageUrl ??
        draft.draft.blocks[0]?.chartImageUrl ??
        null,
      error_message: warning,
      completed_at: new Date().toISOString(),
    })
    .eq('id', item.id)
  if (error) {
    throw new Error(
      `Failed to save generated newsletter item ${item.ticker}: ${error.message}`,
    )
  }
}

function mergeDailyItemAttentionMessage(
  automationWarning: string | null | undefined,
  readinessLabels: string[],
): string {
  const existing = automationWarning?.trim() ?? ''
  const additions = readinessLabels
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label) => !existing.includes(label))
  return [existing, ...additions].filter(Boolean).join(' ')
}

async function processDailyItem(
  scope: NewsletterDraftScope,
  run: NewsletterDailyRun,
  item: NewsletterDailyRunItem,
  chartsBySymbol: Map<string, NewsletterChartLibraryItem>,
  options: DailyProcessOptions,
  dependencies: DailyRunDependencies,
): Promise<'generated' | 'failed'> {
  const itemKey = `daily:${run.id}:${item.ticker}`

  try {
    const existing = await findNewsletterDraftBySourceReviewKey(scope, itemKey)
    if (
      existing?.draft.source?.type === 'daily_batch' &&
      existing.draft.source.automationStatus === 'complete' &&
      !existing.draft.blocks.some((block) => block.chartNeedsRegeneration)
    ) {
      const chartId = existing.draft.source.attachedChartIds[0] ?? null
      const chart = chartsBySymbol.get(item.ticker) ?? null
      await persistGeneratedItem(
        item,
        existing,
        chartId
          ? chart ?? {
              id: chartId,
              ownerId: scope.ownerId,
              sessionId: scope.sessionId,
              title: `${item.ticker} chart`,
              symbol: item.ticker,
              chartSpec: existing.draft.blocks[0].chartSpec as never,
              chartImageUrl: existing.draft.blocks[0].chartImageUrl,
              thumbnailUrl: existing.draft.blocks[0].chartImageUrl,
              chartExportUrl: existing.draft.blocks[0].chartExportUrl,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
            }
          : null,
        null,
      )
      return 'generated'
    }

    let chart = chartsBySymbol.get(item.ticker) ?? null
    let warning: string | null = null
    if (!chart || !isChartCurrent(chart, run.marketDate)) {
      try {
        const createChart =
          dependencies.createChart ?? createDefaultDailyChart
        chart = await createChart(scope, item, options)
        chartsBySymbol.set(item.ticker, chart)
      } catch (error) {
        warning =
          error instanceof Error
            ? `Automatic chart capture failed: ${error.message}`
            : 'Automatic chart capture failed.'
        chart = null
      }
    }

    const rebuilt = buildDailyNewsletterDraft({
      runId: run.id,
      itemId: item.id,
      sourceWiimRunId: run.sourceWiimRunId ?? '',
      marketDate: run.marketDate,
      candidate: item,
      chart,
      warning,
    })

    let draft: NewsletterDraftRecord
    if (existing) {
      const document = chart
        ? mergeRepairedDailyDraft(existing.draft, rebuilt)
        : existing.draft
      draft = await saveNewsletterDraft(
        scope,
        existing.id,
        document,
        existing.status,
        {
          publicChartBaseUrl:
            options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl(),
        },
      )
      if (chart) {
        await appendNewsletterDraftEvent(scope, draft.id, {
          type: 'chart_attached',
          fromStatus: draft.status,
          toStatus: draft.status,
          metadata: {
            dailyRunId: run.id,
            dailyRunItemId: item.id,
            chartIds: [chart.id],
            repaired: true,
          },
        })
      }
    } else {
      draft = await createNewsletterDraftFromDocument(scope, rebuilt, {
        status: chart ? 'review' : 'draft',
        publicChartBaseUrl:
          options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl(),
        eventMetadata: {
          dailyRunId: run.id,
          dailyRunItemId: item.id,
          wiimRunId: run.sourceWiimRunId,
          rank: item.rank,
          chartIds: chart ? [chart.id] : [],
        },
      })
    }

    await persistGeneratedItem(item, draft, chart, warning)
    return 'generated'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const supabase = getServiceClient()
    await supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    return 'failed'
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0
  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await worker(items[index])
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner(),
    ),
  )
}

export async function processNewsletterDailyRun(
  scope: NewsletterDraftScope,
  runId: string,
  options: DailyProcessOptions = {},
  dependencies: DailyRunDependencies = {},
): Promise<NewsletterDailyProcessingResult> {
  await recoverStaleDailyItems(runId)
  const run = await getNewsletterDailyRun(scope, runId)
  const items = await claimDailyItems(runId, options)
  if (items.length === 0) {
    await recalculateNewsletterDailyRun(runId)
    return {
      run: await getNewsletterDailyRun(scope, runId),
      attempted: 0,
      generated: 0,
      failed: 0,
    }
  }

  const supabase = getServiceClient()
  await supabase
    .from(RUNS_TABLE)
    .update({
      status: 'generating',
      started_at: run.startedAt ?? new Date().toISOString(),
      completed_at: null,
      error_message: null,
    })
    .eq('id', runId)

  const listCharts = dependencies.listCharts ?? listNewsletterChartLibraryItems
  const charts = await listCharts(scope)
  const chartsBySymbol = new Map<string, NewsletterChartLibraryItem>()
  for (const chart of charts) {
    const symbol = chart.symbol.trim().toUpperCase()
    if (!chartsBySymbol.has(symbol)) chartsBySymbol.set(symbol, chart)
  }

  let generated = 0
  let failed = 0
  const concurrency = Math.max(
    1,
    Math.min(4, Math.floor(options.concurrency ?? 3)),
  )
  await runPool(items, concurrency, async (item) => {
    const result = await processDailyItem(
      scope,
      run,
      item,
      chartsBySymbol,
      options,
      dependencies,
    )
    if (result === 'generated') generated += 1
    else failed += 1
  })

  await recalculateNewsletterDailyRun(runId)
  return {
    run: await getNewsletterDailyRun(scope, runId),
    attempted: items.length,
    generated,
    failed,
  }
}

export async function finalizeNewsletterDailyItems(
  scope: NewsletterDraftScope,
  runId: string,
  itemIds?: string[],
  options: { publicChartBaseUrl?: string } = {},
): Promise<NewsletterDailyRun> {
  const run = await getNewsletterDailyRun(scope, runId)
  const selectedIds = itemIds?.length ? new Set(itemIds) : null
  const items = run.items.filter(
    (item) =>
      item.draftId &&
      (item.status === 'generated' ||
        item.status === 'needs_attention' ||
        item.status === 'ready') &&
      (!selectedIds || selectedIds.has(item.id)),
  )
  const supabase = getServiceClient()

  await runPool(items, 5, async (item) => {
    try {
      const draft = await getNewsletterDraft(scope, item.draftId!)
      const readiness = canSetNewsletterDraftStatus(draft.draft, 'ready')
      if (!readiness.ready) {
        const automationWarning =
          draft.draft.source?.automationWarning ?? item.errorMessage
        await supabase
          .from(ITEMS_TABLE)
          .update({
            status: 'needs_attention',
            draft_status: draft.status,
            error_message: mergeDailyItemAttentionMessage(
              automationWarning,
              readiness.issues.map((issue) => issue.label),
            ),
          })
          .eq('id', item.id)
        return
      }

      const saved =
        draft.status === 'ready' || draft.status === 'published'
          ? draft
          : await saveNewsletterDraft(scope, draft.id, draft.draft, 'ready', {
              publicChartBaseUrl:
                options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl(),
            })
      await supabase
        .from(ITEMS_TABLE)
        .update({
          status: saved.status === 'published' ? 'published' : 'ready',
          draft_status: saved.status,
          subject_line: saved.subjectLine,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    } catch (error) {
      await supabase
        .from(ITEMS_TABLE)
        .update({
          status: 'needs_attention',
          error_message:
            error instanceof Error ? error.message : String(error),
        })
        .eq('id', item.id)
    }
  })

  await recalculateNewsletterDailyRun(runId)
  return getNewsletterDailyRun(scope, runId)
}

export async function listEnabledNewsletterDailyScopes(): Promise<
  Array<{ scope: NewsletterDraftScope; settings: NewsletterDailySettings }>
> {
  const supabase = getServiceClient()
  const configuredScope = getConfiguredNewsletterAutomationScope()
  let query = supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('enabled', true)
  if (configuredScope?.ownerId) {
    query = query.eq('owner_id', configuredScope.ownerId)
  } else if (configuredScope) {
    query = query
      .is('owner_id', null)
      .eq('session_id', configuredScope.sessionId)
  } else {
    query = query.not('owner_id', 'is', null)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to list newsletter cron settings: ${error.message}`)
  }
  return ((data ?? []) as DailySettingsRow[]).map((row) => ({
    scope: { ownerId: row.owner_id, sessionId: row.session_id },
    settings: mapSettingsRow(row),
  }))
}

export const __testOnly = {
  toEasternDate,
  getEasternDateBounds,
  resolveExistingRunTarget,
  mapItemRow,
  mapRunRow,
  canClaimDailyItem,
  mergeDailyItemAttentionMessage,
  MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
}
