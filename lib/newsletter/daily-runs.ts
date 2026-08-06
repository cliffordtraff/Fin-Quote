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
import { isNewsletterSourceEntityMatch } from './source-integrity'
import { getSP500Constituent } from '@/lib/sp500'

const SETTINGS_TABLE = 'newsletter_daily_settings'
const RUNS_TABLE = 'newsletter_daily_runs'
const ITEMS_TABLE = 'newsletter_daily_run_items'
const STALE_GENERATION_MINUTES = 15
const NEWSLETTER_SOURCE_REFRESH_MARKER = 'newsletterSourceRefreshedAt'
const DAILY_CHART_CAPTURE_BUDGET_MS = 28_000
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
    signal?: AbortSignal,
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
  chartCaptureBudgetMs?: number
  signal?: AbortSignal
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

function defaultNewsletterDailySettings(): NewsletterDailySettings {
  return {
    enabled: true,
    targetCount: DEFAULT_NEWSLETTER_DAILY_TARGET,
    timezone: 'America/New_York',
    generationHour: 8,
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
  options: { allowPartial?: boolean; signal?: AbortSignal } = {},
): Promise<{
  run: SourceWiimRunRow
  candidates: NewsletterDailyCandidate[]
  candidateCount: number
  summaryCount: number
}> {
  const supabase = getServiceClient()
  const bounds = getEasternDateBounds(marketDate)
  options.signal?.throwIfAborted()
  let runQuery = supabase
    .from('wiim_runs')
    .select('id, started_at, completed_at, metadata_json')
    .eq('run_type', 'morning')
    .eq('status', 'completed')
    .gte('started_at', bounds.start)
    .lt('started_at', bounds.end)
    .order('started_at', { ascending: false })
    .limit(12)
  if (options.signal) runQuery = runQuery.abortSignal(options.signal)
  const { data: runRows, error: runError } = await runQuery

  if (runError) {
    throw new NewsletterDailySourceError(
      `Could not load today's WIIM runs: ${runError.message}`,
    )
  }

  let sourceRun: SourceWiimRunRow | null = null
  let candidateRows: DailyWiimCandidateRow[] = []
  for (const run of (runRows ?? []) as SourceWiimRunRow[]) {
    options.signal?.throwIfAborted()
    let candidateQuery = supabase
      .from('wiim_run_candidates')
      .select(
        'id, wiim_run_id, rank, ticker, headline, why_it_matters, confidence_score, candidate_type, state_label, signals_json, source_refs_json, metadata_json',
      )
      .eq('wiim_run_id', run.id)
      .order('rank', { ascending: true })
    if (options.signal) {
      candidateQuery = candidateQuery.abortSignal(options.signal)
    }
    const { data, error } = await candidateQuery

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
  options.signal?.throwIfAborted()
  let summaryQuery = supabase
    .from('stock_summaries')
    .select(
      'symbol, summary_text, no_summary_reason, generated_at, model, run_id, winning_event, metadata',
    )
    .eq('summary_date', marketDate)
    .eq('config_version', WIIM_SUMMARY_CONFIG_VERSION)
    .in('symbol', symbols)
    .order('generated_at', { ascending: false })
    .limit(5000)
  if (options.signal) summaryQuery = summaryQuery.abortSignal(options.signal)
  const { data: summaryRows, error: summaryError } = await summaryQuery

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

  if (!options.allowPartial && candidates.length < targetCount) {
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
  signal?: AbortSignal,
): Promise<NewsletterDailySettings> {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  let query = supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('scope_key', getNewsletterDailyScopeKey(scope))
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to load newsletter daily settings: ${error.message}`)
  }
  if (!data) {
    return defaultNewsletterDailySettings()
  }
  return mapSettingsRow(data as DailySettingsRow)
}

export async function saveNewsletterDailySettings(
  scope: NewsletterDraftScope,
  input: Partial<NewsletterDailySettings>,
  signal?: AbortSignal,
): Promise<NewsletterDailySettings> {
  signal?.throwIfAborted()
  const current = await getNewsletterDailySettings(scope, signal)
  const supabase = getServiceClient()
  let query = supabase
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
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.single()

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
  signal?: AbortSignal,
): Promise<NewsletterDailyRunItem[]> {
  signal?.throwIfAborted()
  if (!items.some((item) => item.draftId)) return items
  const draftIds = items.flatMap((item) =>
    item.draftId ? [item.draftId] : [],
  )
  const [summaries, deliveries] = await Promise.all([
    listNewsletterDrafts(scope, signal),
    scope.ownerId
      ? listBeehiivDeliveries(scope.ownerId, draftIds, signal)
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
  signal?: AbortSignal,
): Promise<NewsletterDailyRun> {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  const scopeKey = getNewsletterDailyScopeKey(scope)
  let runQuery = supabase
        .from(RUNS_TABLE)
        .select('*')
        .eq('id', id)
        .eq('scope_key', scopeKey)
  let itemsQuery = supabase
        .from(ITEMS_TABLE)
        .select('*')
        .eq('run_id', id)
        .order('rank', { ascending: true })
  if (signal) {
    runQuery = runQuery.abortSignal(signal)
    itemsQuery = itemsQuery.abortSignal(signal)
  }
  const [{ data: run, error: runError }, { data: itemRows, error: itemError }] =
    await Promise.all([runQuery.maybeSingle(), itemsQuery])

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
    signal,
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

function candidateItemContentPayload(
  candidate: NewsletterDailyCandidate,
  metadataOverrides: Record<string, unknown> = {},
) {
  return {
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
      ...metadataOverrides,
    } as Json,
  }
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
    ...candidateItemContentPayload(candidate),
  }
}

function isDailyItemSourceEntityValid(
  item: Pick<
    NewsletterDailyRunItem,
    'ticker' | 'headline' | 'summaryText' | 'candidateMetadata'
  >,
): boolean {
  const companyName = getSP500Constituent(item.ticker)?.name
  if (!companyName) return false
  return [item.headline, item.summaryText].every((text) =>
    isNewsletterSourceEntityMatch({
      ticker: item.ticker,
      companyName,
      text,
    }),
  )
}

function shouldRebuildDailyDraft(
  item: Pick<NewsletterDailyRunItem, 'status' | 'candidateMetadata'>,
): boolean {
  return (
    (item.status === 'failed' || item.status === 'needs_attention') &&
    typeof item.candidateMetadata[NEWSLETTER_SOURCE_REFRESH_MARKER] === 'string'
  )
}

function consumeNewsletterSourceRefreshMarker(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata }
  delete next[NEWSLETTER_SOURCE_REFRESH_MARKER]
  return next
}

async function refreshRetryableDailyItemSources(
  run: NewsletterDailyRun,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const retryable = run.items.filter(
    (item) =>
      (item.status === 'failed' || item.status === 'needs_attention') &&
      item.retryCount < MAX_NEWSLETTER_DAILY_ITEM_RETRIES &&
      !isDailyItemSourceEntityValid(item),
  )
  if (retryable.length === 0) return

  const source = await loadSourceUniverse(
    run.marketDate,
    MAX_NEWSLETTER_DAILY_TARGET,
    { allowPartial: true, signal },
  )
  signal?.throwIfAborted()
  const candidates = new Map(
    source.candidates.map((candidate) => [candidate.ticker, candidate]),
  )
  const supabase = getServiceClient()
  for (const item of retryable) {
    signal?.throwIfAborted()
    const candidate = candidates.get(item.ticker)
    if (!candidate) {
      let closeQuery = supabase
        .from(ITEMS_TABLE)
        .update({
          status: 'needs_attention',
          retry_count: MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
          error_message:
            'No entity-validated replacement source is available; manual editorial review is required.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('run_id', run.id)
        .in('status', ['failed', 'needs_attention'])
      if (signal) closeQuery = closeQuery.abortSignal(signal)
      const { error } = await closeQuery
      if (error) {
        throw new Error(
          `Failed to close exhausted source repair for ${item.ticker}: ${error.message}`,
        )
      }
      continue
    }
    let refreshQuery = supabase
      .from(ITEMS_TABLE)
      .update(
        candidateItemContentPayload(candidate, {
          [NEWSLETTER_SOURCE_REFRESH_MARKER]: new Date().toISOString(),
        }),
      )
      .eq('id', item.id)
      .eq('run_id', run.id)
      .in('status', ['failed', 'needs_attention'])
    if (signal) refreshQuery = refreshQuery.abortSignal(signal)
    const { error } = await refreshQuery
    if (error) {
      throw new Error(
        `Failed to refresh newsletter source for ${item.ticker}: ${error.message}`,
      )
    }
  }
}

export async function ensureNewsletterDailyRun(
  scope: NewsletterDraftScope,
  options: {
    marketDate?: string
    targetCount?: number
    signal?: AbortSignal
  } = {},
): Promise<NewsletterDailyRun> {
  options.signal?.throwIfAborted()
  const marketDate = options.marketDate ?? toEasternDate()
  const settings = await saveNewsletterDailySettings(scope, {
    targetCount: options.targetCount,
  }, options.signal)
  options.signal?.throwIfAborted()
  const targetCount = clampNewsletterDailyTarget(
    options.targetCount ?? settings.targetCount,
  )
  const source = await loadSourceUniverse(marketDate, targetCount, {
    signal: options.signal,
  })
  options.signal?.throwIfAborted()
  const supabase = getServiceClient()
  const scopeKey = getNewsletterDailyScopeKey(scope)

  let existingRunQuery = supabase
    .from(RUNS_TABLE)
    .select('*')
    .eq('scope_key', scopeKey)
    .eq('market_date', marketDate)
    .eq('edition', 'morning')
  if (options.signal) {
    existingRunQuery = existingRunQuery.abortSignal(options.signal)
  }
  const { data: existingRun, error: runError } =
    await existingRunQuery.maybeSingle()
  let run = existingRun

  if (runError) {
    throw new Error(`Failed to find today's newsletter run: ${runError.message}`)
  }

  if (!run) {
    let insertQuery = supabase
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
    if (options.signal) insertQuery = insertQuery.abortSignal(options.signal)
    const inserted = await insertQuery.single()
    if (inserted.error || !inserted.data) {
      throw new Error(
        `Failed to create newsletter daily run: ${
          inserted.error?.message ?? 'unknown error'
        }`,
      )
    }
    run = inserted.data
  } else {
    let updateQuery = supabase
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
    if (options.signal) updateQuery = updateQuery.abortSignal(options.signal)
    const updated = await updateQuery.single()
    if (updated.error || !updated.data) {
      throw new Error(
        `Failed to update newsletter daily run: ${
          updated.error?.message ?? 'unknown error'
        }`,
      )
    }
    run = updated.data
  }

  options.signal?.throwIfAborted()
  let existingRowsQuery = supabase
    .from(ITEMS_TABLE)
    .select('ticker, rank')
    .eq('run_id', run.id)
    .order('rank', { ascending: true })
  if (options.signal) {
    existingRowsQuery = existingRowsQuery.abortSignal(options.signal)
  }
  const { data: existingRows, error: existingError } = await existingRowsQuery
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
    let additionsQuery = supabase.from(ITEMS_TABLE).insert(additions)
    if (options.signal) additionsQuery = additionsQuery.abortSignal(options.signal)
    const { error } = await additionsQuery
    if (error) {
      throw new Error(`Failed to create newsletter daily items: ${error.message}`)
    }
  }

  options.signal?.throwIfAborted()
  await recalculateNewsletterDailyRun(run.id, options.signal)
  return getNewsletterDailyRun(scope, run.id, options.signal)
}

async function recalculateNewsletterDailyRun(
  runId: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  let countQuery = supabase
    .from(ITEMS_TABLE)
    .select('status')
    .eq('run_id', runId)
  if (signal) countQuery = countQuery.abortSignal(signal)
  const { data, error } = await countQuery
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
  let updateQuery = supabase
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
  if (signal) updateQuery = updateQuery.abortSignal(signal)
  const { error: updateError } = await updateQuery
  if (updateError) {
    throw new Error(
      `Failed to update newsletter daily counts: ${updateError.message}`,
    )
  }
}

async function recoverStaleDailyItems(runId: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  const cutoff = new Date(
    Date.now() - STALE_GENERATION_MINUTES * 60_000,
  ).toISOString()
  let query = supabase
    .from(ITEMS_TABLE)
    .update({
      status: 'queued',
      error_message: 'Recovered after an interrupted generation attempt.',
      started_at: null,
    })
    .eq('run_id', runId)
    .eq('status', 'generating')
    .lt('started_at', cutoff)
  if (signal) query = query.abortSignal(signal)
  const { error } = await query
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
  options.signal?.throwIfAborted()
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
  let candidatesQuery = supabase
    .from(ITEMS_TABLE)
    .select('*')
    .eq('run_id', runId)
    .in('status', eligible)
    .lt('retry_count', MAX_NEWSLETTER_DAILY_ITEM_RETRIES)
    .order('retry_count', { ascending: true })
    .order('rank', { ascending: true })
    .limit(limit)
  if (options.signal) {
    candidatesQuery = candidatesQuery.abortSignal(options.signal)
  }
  const { data, error } = await candidatesQuery
  if (error) {
    throw new Error(`Failed to find queued newsletter items: ${error.message}`)
  }

  const claimed: NewsletterDailyRunItem[] = []
  try {
    options.signal?.throwIfAborted()
    for (const row of (data ?? []) as DailyItemRow[]) {
      options.signal?.throwIfAborted()
      const original = mapItemRow(row)
      if (
        !canClaimDailyItem(
          row.status as NewsletterDailyItemStatus,
          row.retry_count,
          options.retryFailed === true,
        )
      ) {
        continue
      }
      if (
        row.status !== 'queued' &&
        options.retryFailed === true &&
        !isDailyItemSourceEntityValid(original)
      ) {
        continue
      }
      let claimQuery = supabase
        .from(ITEMS_TABLE)
        .update({
          status: 'generating',
          started_at: new Date().toISOString(),
          completed_at: null,
          error_message: null,
          retry_count: row.retry_count + (row.status === 'queued' ? 0 : 1),
        })
        .eq('id', row.id)
        .eq('status', row.status)
        .eq('retry_count', row.retry_count)
        .select('*')
      if (options.signal) claimQuery = claimQuery.abortSignal(options.signal)
      const { data: claimedRow, error: claimError } =
        await claimQuery.maybeSingle()
      if (claimError) {
        throw new Error(
          `Failed to claim newsletter item ${row.ticker}: ${claimError.message}`,
        )
      }
      if (claimedRow) {
        claimed.push({
          ...mapItemRow(claimedRow as DailyItemRow),
          status: original.status,
          completedAt: original.completedAt,
          errorMessage: original.errorMessage,
        })
      }
      options.signal?.throwIfAborted()
    }
    return claimed
  } catch (error) {
    await restoreUnfinishedDailyClaims(
      claimed,
      'Automatic generation was interrupted and will retry.',
      AbortSignal.timeout(5_000),
    )
    throw error
  }
}

function dailyClaimRestorePayload(
  item: NewsletterDailyRunItem,
  interruptionMessage: string,
) {
  const restoringRetry = item.status !== 'queued'
  return {
    status: item.status,
    retry_count: Math.max(0, item.retryCount - (restoringRetry ? 1 : 0)),
    started_at: null,
    completed_at: item.completedAt,
    error_message:
      restoringRetry && item.errorMessage
        ? item.errorMessage
        : interruptionMessage,
  }
}

function getDailyClaimFence(
  item: Pick<NewsletterDailyRunItem, 'ticker' | 'startedAt'>,
) {
  if (!item.startedAt) {
    throw new Error(`Newsletter item ${item.ticker} has no active claim token.`)
  }
  return { status: 'generating' as const, startedAt: item.startedAt }
}

function dailyItemOperationKey(
  runId: string,
  item: Pick<NewsletterDailyRunItem, 'ticker' | 'startedAt'>,
): string {
  const fence = getDailyClaimFence(item)
  return `daily:${runId}:${item.ticker}:${fence.startedAt}`
}

async function restoreUnfinishedDailyClaims(
  items: NewsletterDailyRunItem[],
  interruptionMessage: string,
  signal?: AbortSignal,
) {
  const supabase = getServiceClient()
  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (!item.startedAt) return
      const fence = getDailyClaimFence(item)
      let restoreQuery = supabase
        .from(ITEMS_TABLE)
        .update(dailyClaimRestorePayload(item, interruptionMessage))
        .eq('id', item.id)
        .eq('status', fence.status)
        .eq('started_at', fence.startedAt)
      if (signal) restoreQuery = restoreQuery.abortSignal(signal)
      const { error } = await restoreQuery
      if (error) {
        throw new Error(
          `Failed to restore interrupted newsletter item ${item.ticker}: ${error.message}`,
        )
      }
    }),
  )
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failure) throw failure.reason
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
      captureTotalTimeoutMs: Math.max(
        1,
        Math.min(
          DAILY_CHART_CAPTURE_BUDGET_MS,
          Math.floor(
            options.chartCaptureBudgetMs ?? DAILY_CHART_CAPTURE_BUDGET_MS,
          ),
        ),
      ),
      signal: options.signal,
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
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const fence = getDailyClaimFence(item)
  const supabase = getServiceClient()
  const complete = Boolean(chart) && !warning
  const status: NewsletterDailyItemStatus = complete
    ? draft.status === 'ready'
      ? 'ready'
      : draft.status === 'published'
        ? 'published'
        : 'generated'
    : 'needs_attention'
  const candidateMetadata = consumeNewsletterSourceRefreshMarker(
    item.candidateMetadata,
  )
  let query = supabase
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
      candidate_json: candidateMetadata as Json,
      error_message: warning,
      completed_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('status', fence.status)
    .eq('started_at', fence.startedAt)
    .select('id')
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(
      `Failed to save generated newsletter item ${item.ticker}: ${error.message}`,
    )
  }
  if (!data) {
    throw new Error(
      `Newsletter item ${item.ticker} lost its generation claim before completion.`,
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
  const fence = getDailyClaimFence(item)
  const itemKey = dailyItemOperationKey(run.id, item)
  const rebuildingQuarantinedDraft = shouldRebuildDailyDraft(item)

  try {
    options.signal?.throwIfAborted()
    const existing = await findNewsletterDraftBySourceReviewKey(
      scope,
      itemKey,
      { signal: options.signal },
    )
    options.signal?.throwIfAborted()
    if (
      !rebuildingQuarantinedDraft &&
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
        options.signal,
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
        options.signal?.throwIfAborted()
        chartsBySymbol.set(item.ticker, chart)
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason ?? error
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
      generatedAt: fence.startedAt,
      operationKey: itemKey,
    })

    let draft: NewsletterDraftRecord
    if (existing) {
      const document = rebuildingQuarantinedDraft
        ? rebuilt
        : chart
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
          signal: options.signal,
          expectedUpdatedAt: existing.updatedAt,
          protectPublished: true,
        },
      )
      options.signal?.throwIfAborted()
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
          signal: options.signal,
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
        signal: options.signal,
      })
      options.signal?.throwIfAborted()
    }

    await persistGeneratedItem(item, draft, chart, warning, options.signal)
    return 'generated'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const supabase = getServiceClient()
    if (options.signal?.aborted) {
      let restoreQuery = supabase
        .from(ITEMS_TABLE)
        .update(
          dailyClaimRestorePayload(
            item,
            'Automatic generation was interrupted and will retry.',
          ),
        )
        .eq('id', item.id)
        .eq('status', fence.status)
        .eq('started_at', fence.startedAt)
      restoreQuery = restoreQuery.abortSignal(AbortSignal.timeout(5_000))
      await restoreQuery
      throw options.signal.reason ?? error
    }
    let failureQuery = supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('status', fence.status)
      .eq('started_at', fence.startedAt)
      .select('id')
    if (options.signal) failureQuery = failureQuery.abortSignal(options.signal)
    const failedWrite = await failureQuery.maybeSingle()
    if (failedWrite.error) {
      throw new Error(
        `Failed to record newsletter item error for ${item.ticker}: ${failedWrite.error.message}`,
      )
    }
    if (!failedWrite.data) {
      throw new Error(
        `Newsletter item ${item.ticker} lost its generation claim while handling an error.`,
      )
    }
    return 'failed'
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
) {
  let nextIndex = 0
  async function runner() {
    while (nextIndex < items.length) {
      signal?.throwIfAborted()
      const index = nextIndex
      nextIndex += 1
      await worker(items[index])
    }
  }
  const results = await Promise.allSettled(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner(),
    ),
  )
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failure) throw failure.reason
  signal?.throwIfAborted()
}

export async function processNewsletterDailyRun(
  scope: NewsletterDraftScope,
  runId: string,
  options: DailyProcessOptions = {},
  dependencies: DailyRunDependencies = {},
): Promise<NewsletterDailyProcessingResult> {
  options.signal?.throwIfAborted()
  await recoverStaleDailyItems(runId, options.signal)
  let run = await getNewsletterDailyRun(scope, runId, options.signal)
  options.signal?.throwIfAborted()
  if (options.retryFailed) {
    await refreshRetryableDailyItemSources(run, options.signal)
    run = await getNewsletterDailyRun(scope, runId, options.signal)
    options.signal?.throwIfAborted()
  }
  const items = await claimDailyItems(runId, options)
  if (items.length === 0) {
    options.signal?.throwIfAborted()
    await recalculateNewsletterDailyRun(runId, options.signal)
    return {
      run: await getNewsletterDailyRun(scope, runId, options.signal),
      attempted: 0,
      generated: 0,
      failed: 0,
    }
  }

  try {
    options.signal?.throwIfAborted()
    const supabase = getServiceClient()
    let runUpdateQuery = supabase
      .from(RUNS_TABLE)
      .update({
        status: 'generating',
        started_at: run.startedAt ?? new Date().toISOString(),
        completed_at: null,
        error_message: null,
      })
      .eq('id', runId)
    if (options.signal) {
      runUpdateQuery = runUpdateQuery.abortSignal(options.signal)
    }
    await runUpdateQuery

    const listCharts = dependencies.listCharts ?? listNewsletterChartLibraryItems
    const charts = await listCharts(scope, options.signal)
    options.signal?.throwIfAborted()
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
    await runPool(
      items,
      concurrency,
      async (item) => {
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
      },
      options.signal,
    )

    await recalculateNewsletterDailyRun(runId, options.signal)
    return {
      run: await getNewsletterDailyRun(scope, runId, options.signal),
      attempted: items.length,
      generated,
      failed,
    }
  } catch (error) {
    const interruptionMessage = options.signal?.aborted
      ? 'Automatic generation was interrupted and will retry.'
      : `Automatic generation stopped before completion: ${
          error instanceof Error ? error.message : String(error)
        }`
    const cleanupSignal = AbortSignal.timeout(5_000)
    await Promise.allSettled([
      restoreUnfinishedDailyClaims(
        items,
        interruptionMessage,
        cleanupSignal,
      ),
      recalculateNewsletterDailyRun(runId, cleanupSignal),
    ])
    throw error
  }
}

export async function finalizeNewsletterDailyItems(
  scope: NewsletterDraftScope,
  runId: string,
  itemIds?: string[],
  options: { publicChartBaseUrl?: string; signal?: AbortSignal } = {},
): Promise<NewsletterDailyRun> {
  options.signal?.throwIfAborted()
  const run = await getNewsletterDailyRun(scope, runId, options.signal)
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
    options.signal?.throwIfAborted()
    try {
      const draft = await getNewsletterDraft(scope, item.draftId!, {
        signal: options.signal,
      })
      const readiness = canSetNewsletterDraftStatus(draft.draft, 'ready')
      if (!readiness.ready) {
        const automationWarning =
          draft.draft.source?.automationWarning ?? item.errorMessage
        let attentionQuery = supabase
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
        if (options.signal) {
          attentionQuery = attentionQuery.abortSignal(options.signal)
        }
        const { error: attentionError } = await attentionQuery
        options.signal?.throwIfAborted()
        if (attentionError) {
          throw new Error(
            `Failed to mark newsletter item ${item.ticker} as needing attention: ${attentionError.message}`,
          )
        }
        return
      }

      const saved =
        draft.status === 'ready' || draft.status === 'published'
          ? draft
          : await saveNewsletterDraft(scope, draft.id, draft.draft, 'ready', {
              publicChartBaseUrl:
                options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl(),
              signal: options.signal,
              expectedUpdatedAt: draft.updatedAt,
              protectPublished: true,
            })
      options.signal?.throwIfAborted()
      let readyQuery = supabase
        .from(ITEMS_TABLE)
        .update({
          status: saved.status === 'published' ? 'published' : 'ready',
          draft_status: saved.status,
          subject_line: saved.subjectLine,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id)
      if (options.signal) readyQuery = readyQuery.abortSignal(options.signal)
      const { error: readyError } = await readyQuery
      options.signal?.throwIfAborted()
      if (readyError) {
        throw new Error(
          `Failed to finalize newsletter item ${item.ticker}: ${readyError.message}`,
        )
      }
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason ?? error
      const primaryError =
        error instanceof Error ? error : new Error(String(error))
      let failureQuery = supabase
        .from(ITEMS_TABLE)
        .update({
          status: 'needs_attention',
          error_message: primaryError.message,
        })
        .eq('id', item.id)
      if (options.signal) {
        failureQuery = failureQuery.abortSignal(options.signal)
      }

      let failureError: unknown = null
      try {
        const result = await failureQuery
        options.signal?.throwIfAborted()
        failureError = result.error
      } catch (fallbackError) {
        if (options.signal?.aborted) {
          throw options.signal.reason ?? fallbackError
        }
        failureError = fallbackError
      }

      if (failureError) {
        const fallbackError =
          failureError instanceof Error
            ? failureError
            : new Error(
                typeof failureError === 'object' &&
                  failureError !== null &&
                  'message' in failureError &&
                  typeof failureError.message === 'string'
                  ? failureError.message
                  : String(failureError),
              )
        throw new AggregateError(
          [primaryError, fallbackError],
          `${primaryError.message} Failed to persist newsletter item ${item.ticker} retry state: ${fallbackError.message}`,
        )
      }
    }
  }, options.signal)

  await recalculateNewsletterDailyRun(runId, options.signal)
  return getNewsletterDailyRun(scope, runId, options.signal)
}

export async function listEnabledNewsletterDailyScopes(
  signal?: AbortSignal,
): Promise<
  Array<{ scope: NewsletterDraftScope; settings: NewsletterDailySettings }>
> {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  const configuredScope = getConfiguredNewsletterAutomationScope()

  if (configuredScope) {
    let query = supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .eq('scope_key', getNewsletterDailyScopeKey(configuredScope))
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query.maybeSingle()
    if (error) {
      throw new Error(
        `Failed to list newsletter cron settings: ${error.message}`,
      )
    }
    if (!data) {
      return [
        {
          scope: configuredScope,
          settings: defaultNewsletterDailySettings(),
        },
      ]
    }
    const row = data as DailySettingsRow
    return row.enabled
      ? [
          {
            scope: { ownerId: row.owner_id, sessionId: row.session_id },
            settings: mapSettingsRow(row),
          },
        ]
      : []
  }

  let query = supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('enabled', true)
    .not('owner_id', 'is', null)
  if (signal) query = query.abortSignal(signal)
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
  isDailyItemSourceEntityValid,
  shouldRebuildDailyDraft,
  consumeNewsletterSourceRefreshMarker,
  dailyClaimRestorePayload,
  getDailyClaimFence,
  dailyItemOperationKey,
  runPool,
  DAILY_CHART_CAPTURE_BUDGET_MS,
  MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
}
