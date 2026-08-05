import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  getUsMarketHolidayName,
  isUsMarketTradingDay,
} from '@/lib/market-calendar'
import {
  fetchWiimCandidates,
  generateDailySummaryBatch,
  getDailySummaryCoverage,
  rankWiimCandidates,
  runWiimBrief,
  summarizeWarmResults,
  warmSymbol,
  type WarmResult,
} from '@/lib/wiim'
import {
  ensureNewsletterDailyRun,
  finalizeNewsletterDailyItems,
  getNewsletterDailyRun,
  listEnabledNewsletterDailyScopes,
  MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
  processNewsletterDailyRun,
} from './daily-runs'
import { createNewsletterNotification } from './notifications'
import { selectNewsletterRecommendedIssues } from './shortlist'

const TABLE = 'newsletter_daily_automation_runs'
const FINVIZ_BATCH_SIZE = 30
const SUMMARY_BATCH_SIZE = 4
const NEWSLETTER_BATCH_SIZE = 3
const MAX_SOURCE_ATTEMPTS = 2
const MAX_STAGE_ERRORS = 3
const DEFAULT_READY_BY_HOUR = 8
const RECOVERY_END_HOUR = 12

type AutomationRow =
  Database['public']['Tables']['newsletter_daily_automation_runs']['Row']

export type NewsletterDailyAutomationStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'

export type NewsletterDailyAutomationStage =
  | 'collecting'
  | 'finviz'
  | 'wiim'
  | 'summaries'
  | 'newsletters'
  | 'finalizing'
  | 'completed'
  | 'failed'

export interface NewsletterDailyAutomationRun {
  id: string
  marketDate: string
  status: NewsletterDailyAutomationStatus
  stage: NewsletterDailyAutomationStage
  candidateSymbols: string[]
  candidateCount: number
  finvizCompletedCount: number
  finvizFoundCount: number
  finvizErrorCount: number
  summaryCompletedCount: number
  summaryGeneratedCount: number
  summaryNoResultCount: number
  summaryErrorCount: number
  wiimRunId: string | null
  newsletterScopeCount: number
  newsletterCompletedScopeCount: number
  newsletterSelectedCount: number
  newsletterGeneratedCount: number
  newsletterReadyCount: number
  newsletterAttentionCount: number
  newsletterFailedCount: number
  invocationCount: number
  lastError: string | null
  metadata: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  lastHeartbeatAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewsletterAutomationClock {
  marketDate: string
  weekday: string
  hour: number
  minute: number
  isWeekday: boolean
  isTradingDay: boolean
  holidayName: string | null
  isCollectionWindow: boolean
  isMorningReportWindow: boolean
}

export interface NewsletterAutomationWindow {
  readyByHour: number
  startHour: number
  shouldRun: boolean
  isLate: boolean
  hasEnded: boolean
}

export interface AdvanceNewsletterDailyAutomationResult {
  claimed: boolean
  action: string
  run: NewsletterDailyAutomationRun
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration for newsletter automation',
    )
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringNumberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const count = Number(entry)
      return Number.isFinite(count) ? [[key, count]] : []
    }),
  )
}

function mapRow(row: AutomationRow): NewsletterDailyAutomationRun {
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
    metadata: isRecord(row.metadata_json) ? row.metadata_json : {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getNewsletterAutomationClock(
  now = new Date(),
): NewsletterAutomationClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = read('weekday')
  const hour = Number(read('hour'))
  const minute = Number(read('minute'))
  const isWeekday = !['Sat', 'Sun'].includes(weekday)
  const marketDate = `${read('year')}-${read('month')}-${read('day')}`
  const holidayName = getUsMarketHolidayName(marketDate)
  const isTradingDay = isWeekday && isUsMarketTradingDay(marketDate)
  return {
    weekday,
    marketDate,
    hour,
    minute,
    isWeekday,
    isTradingDay,
    holidayName,
    isCollectionWindow: isTradingDay && hour >= 5 && hour < 8,
    isMorningReportWindow:
      isTradingDay && hour >= 5 && hour < RECOVERY_END_HOUR,
  }
}

export function getNewsletterAutomationWindow(
  clock: NewsletterAutomationClock,
  generationHours: number[],
): NewsletterAutomationWindow {
  const normalized = generationHours
    .filter(Number.isFinite)
    .map((hour) => Math.max(0, Math.min(23, Math.floor(hour))))
  const readyByHour =
    normalized.length > 0
      ? Math.min(...normalized)
      : DEFAULT_READY_BY_HOUR
  const startHour = Math.max(0, readyByHour - 3)
  const minuteOfDay = clock.hour * 60 + clock.minute
  const startMinute = startHour * 60
  const deadlineMinute = readyByHour * 60
  const endMinute = RECOVERY_END_HOUR * 60
  return {
    readyByHour,
    startHour,
    shouldRun:
      clock.isTradingDay &&
      minuteOfDay >= startMinute &&
      minuteOfDay < endMinute,
    isLate:
      clock.isTradingDay &&
      minuteOfDay >= deadlineMinute &&
      minuteOfDay < endMinute,
    hasEnded: minuteOfDay >= endMinute,
  }
}

export function getNewsletterAutomationStageLabel(
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

const RETRYABLE_STAGES: NewsletterDailyAutomationStage[] = [
  'collecting',
  'finviz',
  'wiim',
  'summaries',
  'newsletters',
  'finalizing',
]

function retryableStage(value: unknown): NewsletterDailyAutomationStage {
  return typeof value === 'string' &&
    RETRYABLE_STAGES.includes(value as NewsletterDailyAutomationStage)
    ? (value as NewsletterDailyAutomationStage)
    : 'collecting'
}

async function updateRun(
  id: string,
  patch: Database['public']['Tables']['newsletter_daily_automation_runs']['Update'],
) {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...patch,
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(
      `Failed to update newsletter automation: ${
        error?.message ?? 'unknown error'
      }`,
    )
  }
  return mapRow(data as AutomationRow)
}

export async function getNewsletterDailyAutomationRun(
  marketDate?: string,
): Promise<NewsletterDailyAutomationRun | null> {
  const supabase = getServiceClient()
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('market_date', { ascending: false })
    .limit(1)
  if (marketDate) query = query.eq('market_date', marketDate)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load newsletter automation: ${error.message}`)
  }
  return data ? mapRow(data as AutomationRow) : null
}

export async function listNewsletterDailyAutomationRuns(
  limit = 7,
): Promise<NewsletterDailyAutomationRun[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('market_date', { ascending: false })
    .limit(Math.max(1, Math.min(30, limit)))
  if (error) {
    throw new Error(`Failed to list newsletter automation runs: ${error.message}`)
  }
  return ((data ?? []) as AutomationRow[]).map(mapRow)
}

export async function hasFinishedNewsletterMorningReport(
  marketDate: string,
): Promise<boolean> {
  const run = await getNewsletterDailyAutomationRun(marketDate)
  return Boolean(
    run &&
      (run.status === 'completed' || run.status === 'partial') &&
      run.newsletterGeneratedCount > 0,
  )
}

async function claimRun(marketDate: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_daily_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
      p_lease_seconds: 90,
    },
  )
  if (error) {
    throw new Error(`Failed to claim newsletter automation: ${error.message}`)
  }
  const row = data?.[0]
  return row ? mapRow(row as AutomationRow) : null
}

async function releaseRun(marketDate: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { error } = await supabase.rpc(
    'release_newsletter_daily_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
    },
  )
  if (error) {
    throw new Error(`Failed to release newsletter automation: ${error.message}`)
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
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runner(),
    ),
  )
}

async function collectCandidates(run: NewsletterDailyAutomationRun) {
  const fetched = await fetchWiimCandidates()
  const ranked = rankWiimCandidates(
    fetched.candidates,
    fetched.candidates.length,
  )
  const symbols = Array.from(
    new Set(
      ranked
        .map((candidate) => candidate.ticker?.trim().toUpperCase())
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  )
  if (symbols.length < 30) {
    throw new Error(
      `Only ${symbols.length} current market candidates were available; at least 30 are required.`,
    )
  }
  return updateRun(run.id, {
    stage: 'finviz',
    candidate_symbols: symbols,
    candidate_count: symbols.length,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      marketCandidateCount: fetched.marketCandidateCount,
      candidateSnapshotAt: fetched.generatedAt,
      finvizAttempts: {},
      summaryAttempts: {},
    } as unknown as Json,
  })
}

async function loadFinvizCoverage(
  run: NewsletterDailyAutomationRun,
): Promise<Map<string, { status: string; fetchedAt: string }>> {
  const supabase = getServiceClient()
  const coverage = new Map<string, { status: string; fetchedAt: string }>()
  const since = run.startedAt ?? run.createdAt
  for (let index = 0; index < run.candidateSymbols.length; index += 100) {
    const batch = run.candidateSymbols.slice(index, index + 100)
    const { data, error } = await supabase
      .from('stock_why_moving_cache')
      .select('symbol, status, fetched_at')
      .in('symbol', batch)
      .gte('fetched_at', since)
    if (error) {
      throw new Error(`Failed to inspect Finviz coverage: ${error.message}`)
    }
    for (const row of data ?? []) {
      coverage.set(row.symbol, {
        status: row.status,
        fetchedAt: row.fetched_at,
      })
    }
  }
  return coverage
}

async function refreshFinvizBatch(run: NewsletterDailyAutomationRun) {
  const attempts = stringNumberMap(run.metadata.finvizAttempts)
  const before = await loadFinvizCoverage(run)
  const missing = run.candidateSymbols.filter(
    (symbol) =>
      !before.has(symbol) && (attempts[symbol] ?? 0) < MAX_SOURCE_ATTEMPTS,
  )
  const batch = missing.slice(0, FINVIZ_BATCH_SIZE)
  const results: WarmResult[] = []
  await runPool(batch, 2, async (symbol) => {
    const result = await warmSymbol(symbol, {
      dryRun: false,
      forceRefresh: true,
      perSymbolPauseMs: 250,
      jitterMs: 100,
    })
    attempts[symbol] = (attempts[symbol] ?? 0) + 1
    results.push(result)
  })

  const after = await loadFinvizCoverage(run)
  const exhausted = run.candidateSymbols.filter(
    (symbol) =>
      !after.has(symbol) && (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completedCount = after.size + exhausted.length
  const foundCount = Array.from(after.values()).filter(
    (entry) => entry.status === 'found',
  ).length
  const liveSummary = summarizeWarmResults(results)
  const done = completedCount >= run.candidateSymbols.length
  return updateRun(run.id, {
    stage: done ? 'wiim' : 'finviz',
    finviz_completed_count: completedCount,
    finviz_found_count: foundCount,
    finviz_error_count:
      exhausted.length +
      Array.from(after.values()).filter((entry) => entry.status === 'error')
        .length,
    last_error:
      exhausted.length > 0
        ? `${exhausted.length} Finviz symbols exhausted automatic retries.`
        : null,
    metadata_json: {
      ...run.metadata,
      finvizAttempts: attempts,
      finvizLastBatch: batch,
      finvizLastBatchSummary: liveSummary,
      finvizExhaustedSymbols: exhausted,
      finvizCompletedAt: done ? new Date().toISOString() : null,
    } as unknown as Json,
  })
}

async function createWiimSnapshot(run: NewsletterDailyAutomationRun) {
  const wiim = await runWiimBrief({
    runType: 'morning',
    compareLatest: true,
    label: 'WIIM Automated Morning Brief',
    persist: true,
  })
  if (!wiim.runId) {
    throw new Error('The automated WIIM run did not return a persisted run ID')
  }
  return updateRun(run.id, {
    stage: 'summaries',
    wiim_run_id: wiim.runId,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      wiimGeneratedAt: wiim.generatedAt,
      wiimRankedCandidateCount: wiim.rankedCandidateCount,
      wiimTopCandidate: wiim.topCandidate,
    } as Json,
  })
}

async function generateSummaryBatch(run: NewsletterDailyAutomationRun) {
  const attempts = stringNumberMap(run.metadata.summaryAttempts)
  const before = await getDailySummaryCoverage(
    run.marketDate,
    run.candidateSymbols,
  )
  const completedBefore = new Set(before.completedSymbols)
  const retryable = run.candidateSymbols.filter(
    (symbol) =>
      !completedBefore.has(symbol) &&
      (attempts[symbol] ?? 0) < MAX_SOURCE_ATTEMPTS,
  )
  const result = await generateDailySummaryBatch({
    marketDate: run.marketDate,
    symbols: retryable,
    runSymbols: run.candidateSymbols,
    runId: `newsletter_automation_${run.id}`,
    limit: SUMMARY_BATCH_SIZE,
    concurrency: 4,
    perSymbolTimeoutMs: 45_000,
  })
  for (const symbol of result.attemptedSymbols) {
    attempts[symbol] = (attempts[symbol] ?? 0) + 1
  }

  const after = await getDailySummaryCoverage(
    run.marketDate,
    run.candidateSymbols,
  )
  const completedAfter = new Set(after.completedSymbols)
  const exhausted = run.candidateSymbols.filter(
    (symbol) =>
      !completedAfter.has(symbol) &&
      (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completedCount = completedAfter.size + exhausted.length
  const done = completedCount >= run.candidateSymbols.length
  return updateRun(run.id, {
    stage: done ? 'newsletters' : 'summaries',
    summary_completed_count: completedCount,
    summary_generated_count: after.generatedSymbols.length,
    summary_no_result_count: after.noResultSymbols.length,
    summary_error_count: exhausted.length,
    last_error:
      exhausted.length > 0
        ? `${exhausted.length} summaries exhausted automatic retries.`
        : null,
    metadata_json: {
      ...run.metadata,
      summaryAttempts: attempts,
      summaryLastBatch: result.attemptedSymbols,
      summaryLastBatchFailures: result.failed,
      summaryExhaustedSymbols: exhausted,
      summariesCompletedAt: done ? new Date().toISOString() : null,
    } as Json,
  })
}

function newsletterRunIds(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : [],
    ),
  )
}

async function generateNewsletterBatch(run: NewsletterDailyAutomationRun) {
  const scopes = await listEnabledNewsletterDailyScopes()
  if (scopes.length === 0) {
    throw new Error(
      'No enabled newsletter automation scope is configured. Set NEWSLETTER_AUTOMATION_OWNER_ID or NEWSLETTER_AUTOMATION_SESSION_ID.',
    )
  }

  const runIds = newsletterRunIds(run.metadata.newsletterRunIds)
  for (const { scope, settings } of scopes) {
    const scopeKey = scope.ownerId
      ? `owner:${scope.ownerId}`
      : `session:${scope.sessionId}`
    const dailyRun = await ensureNewsletterDailyRun(scope, {
      marketDate: run.marketDate,
      targetCount: settings.targetCount,
    })
    runIds[scopeKey] = dailyRun.id
    const retryable = dailyRun.items.filter(
      (item) =>
        (item.status === 'queued' ||
          item.status === 'failed' ||
          item.status === 'needs_attention') &&
        item.retryCount < MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
    )
    if (retryable.length > 0) {
      await processNewsletterDailyRun(scope, dailyRun.id, {
        limit: NEWSLETTER_BATCH_SIZE,
        concurrency: 3,
        retryFailed: true,
      })
      break
    }
  }

  const refreshed = await Promise.all(
    scopes.map(async ({ scope }) => {
      const scopeKey = scope.ownerId
        ? `owner:${scope.ownerId}`
        : `session:${scope.sessionId}`
      return getNewsletterDailyRun(scope, runIds[scopeKey])
    }),
  )
  const selected = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.selectedCount,
    0,
  )
  const generated = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.generatedCount,
    0,
  )
  const ready = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.readyCount,
    0,
  )
  const attention = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.attentionCount,
    0,
  )
  const failed = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.failedCount,
    0,
  )
  const active = refreshed.some((dailyRun) =>
    dailyRun.items.some(
      (item) =>
        item.status === 'queued' ||
        item.status === 'generating' ||
        ((item.status === 'failed' || item.status === 'needs_attention') &&
          item.retryCount < MAX_NEWSLETTER_DAILY_ITEM_RETRIES),
    ),
  )
  const completedScopeCount = refreshed.filter(
    (dailyRun) => dailyRun.generatedCount >= dailyRun.selectedCount,
  ).length

  return updateRun(run.id, {
    stage: active ? 'newsletters' : 'finalizing',
    newsletter_scope_count: scopes.length,
    newsletter_completed_scope_count: completedScopeCount,
    newsletter_selected_count: selected,
    newsletter_generated_count: generated,
    newsletter_ready_count: ready,
    newsletter_attention_count: attention,
    newsletter_failed_count: failed,
    last_error: failed > 0 ? `${failed} newsletter issues failed.` : null,
    metadata_json: {
      ...run.metadata,
      newsletterRunIds: runIds,
      newsletterUpdatedAt: new Date().toISOString(),
    } as Json,
  })
}

async function finalizeNewsletters(run: NewsletterDailyAutomationRun) {
  const scopes = await listEnabledNewsletterDailyScopes()
  const runIds = newsletterRunIds(run.metadata.newsletterRunIds)
  const refreshed: Awaited<ReturnType<typeof getNewsletterDailyRun>>[] = []

  for (const { scope } of scopes) {
    const scopeKey = scope.ownerId
      ? `owner:${scope.ownerId}`
      : `session:${scope.sessionId}`
    const dailyRunId = runIds[scopeKey]
    if (!dailyRunId) continue
    await finalizeNewsletterDailyItems(scope, dailyRunId)
    refreshed.push(await getNewsletterDailyRun(scope, dailyRunId))
  }

  const selected = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.selectedCount,
    0,
  )
  const generated = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.generatedCount,
    0,
  )
  const ready = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.readyCount,
    0,
  )
  const attention = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.attentionCount,
    0,
  )
  const failed = refreshed.reduce(
    (total, dailyRun) => total + dailyRun.failedCount,
    0,
  )
  const retryable = refreshed.some((dailyRun) =>
    dailyRun.items.some(
      (item) =>
        (item.status === 'failed' || item.status === 'needs_attention') &&
        item.retryCount < MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
    ),
  )
  if (retryable) {
    return updateRun(run.id, {
      stage: 'newsletters',
      newsletter_selected_count: selected,
      newsletter_generated_count: generated,
      newsletter_ready_count: ready,
      newsletter_attention_count: attention,
      newsletter_failed_count: failed,
      last_error:
        attention + failed > 0
          ? `${attention + failed} issues need an automatic retry.`
          : null,
    })
  }

  const clean =
    selected > 0 && ready >= selected && attention === 0 && failed === 0
  const completedAt = new Date().toISOString()
  const completed = await updateRun(run.id, {
    status: clean ? 'completed' : 'partial',
    stage: 'completed',
    newsletter_completed_scope_count: refreshed.filter(
      (dailyRun) => dailyRun.generatedCount >= dailyRun.selectedCount,
    ).length,
    newsletter_selected_count: selected,
    newsletter_generated_count: generated,
    newsletter_ready_count: ready,
    newsletter_attention_count: attention,
    newsletter_failed_count: failed,
    last_error:
      clean
        ? null
        : `Morning report completed with ${attention} attention and ${failed} failed issues.`,
    completed_at: completedAt,
    metadata_json: {
      ...run.metadata,
      reportReadyAt: completedAt,
    } as Json,
  })

  await Promise.allSettled(
    scopes.map(async ({ scope }) => {
      const scopeKey = scope.ownerId
        ? `owner:${scope.ownerId}`
        : `session:${scope.sessionId}`
      const dailyRunId = runIds[scopeKey]
      const dailyRun = refreshed.find((entry) => entry.id === dailyRunId)
      if (!dailyRun) return
      const shortlist = selectNewsletterRecommendedIssues(dailyRun.items)
      const tickers = shortlist.map((entry) => entry.ticker).join(', ')
      await createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'morning_completed',
        severity: clean ? 'success' : 'warning',
        title: clean
          ? 'Morning newsletter report is ready'
          : 'Morning report completed with review items',
        message: [
          `${dailyRun.readyCount} of ${dailyRun.selectedCount} issues are ready.`,
          tickers ? `Start with ${tickers}.` : '',
          attention + failed > 0
            ? `${attention + failed} issues need attention.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        actionUrl: '/newsletter/morning-review',
        metadata: {
          automationRunId: run.id,
          dailyRunId: dailyRun.id,
          readyCount: dailyRun.readyCount,
          selectedCount: dailyRun.selectedCount,
          attentionCount: dailyRun.attentionCount,
          failedCount: dailyRun.failedCount,
          shortlist,
        },
        dedupeKey: `morning-completed:${run.marketDate}`,
      })
    }),
  )
  return completed
}

export async function notifyNewsletterMorningLate(input: {
  marketDate: string
  readyByHour: number
  run: NewsletterDailyAutomationRun | null
}) {
  const scopes = await listEnabledNewsletterDailyScopes()
  await Promise.allSettled(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: input.marketDate,
        type: 'morning_late',
        severity: 'warning',
        title: 'Morning newsletter report is running late',
        message: input.run
          ? `The ${getNewsletterAutomationStageLabel(input.run.stage).toLowerCase()} stage is still running after ${input.readyByHour}:00 AM ET. Automatic recovery continues until noon.`
          : `The report was not started by ${input.readyByHour}:00 AM ET. Automatic recovery is starting now.`,
        actionUrl: '/newsletter/morning-review',
        metadata: {
          automationRunId: input.run?.id ?? null,
          stage: input.run?.stage ?? null,
          readyByHour: input.readyByHour,
        },
        dedupeKey: `morning-late:${input.marketDate}`,
      }),
    ),
  )
}

async function notifyNewsletterMorningFailure(
  run: NewsletterDailyAutomationRun,
  failedStage: NewsletterDailyAutomationStage,
) {
  const scopes = await listEnabledNewsletterDailyScopes()
  await Promise.allSettled(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'morning_failed',
        severity: 'error',
        title: 'Morning newsletter automation stopped',
        message: `${getNewsletterAutomationStageLabel(failedStage)} failed after ${MAX_STAGE_ERRORS} attempts. ${run.lastError ?? 'Review the run before retrying.'}`,
        actionUrl: '/newsletter/morning-review',
        metadata: {
          automationRunId: run.id,
          stage: failedStage,
          error: run.lastError,
        },
        dedupeKey: `morning-failed:${run.marketDate}:${failedStage}`,
      }),
    ),
  )
}

export async function advanceNewsletterDailyAutomation(input: {
  marketDate?: string
  retryCompleted?: boolean
  retryFailed?: boolean
} = {}): Promise<AdvanceNewsletterDailyAutomationResult> {
  const marketDate =
    input.marketDate ?? getNewsletterAutomationClock().marketDate
  const leaseToken = crypto.randomUUID()
  const claimed = await claimRun(marketDate, leaseToken)
  if (!claimed) {
    const run = await getNewsletterDailyAutomationRun(marketDate)
    if (!run) {
      throw new Error('Newsletter automation is locked but no run was found')
    }
    return { claimed: false, action: 'locked', run }
  }

  let current = claimed
  try {
    if (
      !input.retryCompleted &&
      (current.status === 'completed' || current.status === 'partial')
    ) {
      return { claimed: true, action: 'already-completed', run: current }
    }

    switch (current.stage) {
      case 'collecting':
        current = await collectCandidates(current)
        return { claimed: true, action: 'candidates-collected', run: current }
      case 'finviz':
        current = await refreshFinvizBatch(current)
        return { claimed: true, action: 'finviz-batch', run: current }
      case 'wiim':
        current = await createWiimSnapshot(current)
        return { claimed: true, action: 'wiim-generated', run: current }
      case 'summaries':
        current = await generateSummaryBatch(current)
        return { claimed: true, action: 'summary-batch', run: current }
      case 'newsletters':
        current = await generateNewsletterBatch(current)
        return { claimed: true, action: 'newsletter-batch', run: current }
      case 'finalizing':
        current = await finalizeNewsletters(current)
        return { claimed: true, action: 'newsletters-finalized', run: current }
      case 'completed':
        return { claimed: true, action: 'already-completed', run: current }
      case 'failed':
        if (!input.retryFailed) {
          return { claimed: true, action: 'failed-terminal', run: current }
        }
        const retryStage = retryableStage(current.metadata.lastFailureStage)
        const stageErrorCounts = stringNumberMap(
          current.metadata.stageErrorCounts,
        )
        delete stageErrorCounts[retryStage]
        current = await updateRun(current.id, {
          status: 'running',
          stage: retryStage,
          last_error: null,
          completed_at: null,
          metadata_json: {
            ...current.metadata,
            stageErrorCounts,
            manualRetryAt: new Date().toISOString(),
            manualRetryStage: retryStage,
          } as Json,
        })
        return { claimed: true, action: 'failed-stage-resumed', run: current }
    }
  } catch (error) {
    const failedStage = current.stage
    const message = error instanceof Error ? error.message : String(error)
    const stageErrors = stringNumberMap(current.metadata.stageErrorCounts)
    const stageErrorCount = (stageErrors[failedStage] ?? 0) + 1
    stageErrors[failedStage] = stageErrorCount
    const terminal = stageErrorCount >= MAX_STAGE_ERRORS
    current = await updateRun(current.id, {
      status: terminal ? 'failed' : 'running',
      stage: terminal ? 'failed' : failedStage,
      last_error: message,
      completed_at: terminal ? new Date().toISOString() : null,
      metadata_json: {
        ...current.metadata,
        lastFailureAt: new Date().toISOString(),
        lastFailureStage: failedStage,
        stageErrorCounts: stageErrors,
      } as Json,
    })
    if (terminal) {
      await notifyNewsletterMorningFailure(current, failedStage)
    }
    return { claimed: true, action: 'stage-error', run: current }
  } finally {
    await releaseRun(marketDate, leaseToken).catch(() => undefined)
  }
}

export const __testOnly = {
  mapRow,
  stringNumberMap,
  newsletterRunIds,
  retryableStage,
}
