import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  fetchWiimCandidates,
  generateDailySummaryBatch,
  rankWiimCandidates,
  runWiimBrief,
  summarizeWarmResults,
  warmSymbol,
  type WarmResult,
} from '@/lib/wiim'
import type { NewsletterAutomationClock } from './daily-automation'
import { listEnabledNewsletterDailyScopes } from './daily-runs'
import { createNewsletterNotification } from './notifications'
import {
  NEWSLETTER_AUTOMATION_LEASE_SECONDS,
  NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
  NewsletterAutomationLeaseLostError,
  NewsletterAutomationStageBudgetError,
  runWithNewsletterAutomationLease,
} from './automation-lease'
import {
  classifySummaryCoverage,
  createFinvizAttemptCheckpointer,
  getFinvizCoverageState,
  getMidMorningAutomationFinalStatus,
} from './automation-coverage'

const TABLE = 'newsletter_mid_morning_runs'
const FINVIZ_BATCH_SIZE = 10
const CANDIDATE_COUNT = 20
const MAX_SOURCE_ATTEMPTS = 2
const MAX_STAGE_ERRORS = 3

type MidMorningRow =
  Database['public']['Tables']['newsletter_mid_morning_runs']['Row']

export type NewsletterMidMorningStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'

export type NewsletterMidMorningStage =
  | 'collecting'
  | 'finviz'
  | 'wiim'
  | 'summaries'
  | 'finalizing'
  | 'completed'
  | 'failed'

export interface NewsletterMidMorningRun {
  id: string
  marketDate: string
  status: NewsletterMidMorningStatus
  stage: NewsletterMidMorningStage
  candidateSymbols: string[]
  candidateCount: number
  finvizCompletedCount: number
  finvizFoundCount: number
  finvizErrorCount: number
  morningWiimRunId: string | null
  midMorningWiimRunId: string | null
  summaryCompletedCount: number
  summaryGeneratedCount: number
  summaryErrorCount: number
  meaningfulChange: boolean | null
  invocationCount: number
  lastError: string | null
  notificationAppliedAt: string | null
  notificationAttemptCount: number
  notificationLastError: string | null
  metadata: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  lastHeartbeatAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MidMorningAutomationWindow {
  startHour: number
  startMinute: number
  shouldRun: boolean
  isLate: boolean
  hasEnded: boolean
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role configuration for mid-morning automation',
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && Boolean(entry),
  )
}

function mapRow(row: MidMorningRow): NewsletterMidMorningRun {
  return {
    id: row.id,
    marketDate: row.market_date,
    status: row.status as NewsletterMidMorningStatus,
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

export function getMidMorningAutomationWindow(
  clock: NewsletterAutomationClock,
): MidMorningAutomationWindow {
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

export function getMidMorningAutomationStageLabel(
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

const RETRYABLE_STAGES: NewsletterMidMorningStage[] = [
  'collecting',
  'finviz',
  'wiim',
  'summaries',
  'finalizing',
]

function retryableStage(value: unknown): NewsletterMidMorningStage {
  return typeof value === 'string' &&
    RETRYABLE_STAGES.includes(value as NewsletterMidMorningStage)
    ? (value as NewsletterMidMorningStage)
    : 'collecting'
}

async function updateRun(
  id: string,
  leaseToken: string,
  patch: Database['public']['Tables']['newsletter_mid_morning_runs']['Update'],
  signal?: AbortSignal,
) {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'update_newsletter_mid_morning_automation_claim',
    {
      p_run_id: id,
      p_lease_token: leaseToken,
      p_patch: patch as Json,
      p_lease_seconds: NEWSLETTER_AUTOMATION_LEASE_SECONDS,
    },
  )
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(
      `Failed to update mid-morning automation: ${error.message}`,
    )
  }
  const row = data?.[0]
  if (!row) {
    throw new NewsletterAutomationLeaseLostError(
      'Mid-morning newsletter automation',
    )
  }
  return mapRow(row as MidMorningRow)
}

export async function getNewsletterMidMorningRun(
  marketDate?: string,
): Promise<NewsletterMidMorningRun | null> {
  const supabase = getServiceClient()
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('market_date', { ascending: false })
    .limit(1)
  if (marketDate) query = query.eq('market_date', marketDate)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(`Failed to load mid-morning automation: ${error.message}`)
  }
  return data ? mapRow(data as MidMorningRow) : null
}

export async function getPendingNewsletterMidMorningTerminalNotification(
  beforeMarketDate: string,
): Promise<NewsletterMidMorningRun | null> {
  const cutoff = new Date(
    Date.parse(`${beforeMarketDate}T12:00:00Z`) - 7 * 86_400_000,
  ).toISOString().slice(0, 10)
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('status', ['completed', 'partial', 'failed'])
    .is('notification_applied_at', null)
    .gte('market_date', cutoff)
    .lt('market_date', beforeMarketDate)
    .order('market_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new Error(
      `Failed to load pending mid-morning notification: ${error.message}`,
    )
  }
  return data ? mapRow(data as MidMorningRow) : null
}

export async function listNewsletterMidMorningRuns(
  limit = 7,
): Promise<NewsletterMidMorningRun[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('market_date', { ascending: false })
    .limit(Math.max(1, Math.min(30, limit)))
  if (error) {
    throw new Error(`Failed to list mid-morning automation: ${error.message}`)
  }
  return ((data ?? []) as MidMorningRow[]).map(mapRow)
}

async function claimRun(marketDate: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_mid_morning_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
      p_lease_seconds: NEWSLETTER_AUTOMATION_LEASE_SECONDS,
    },
  )
  if (error) {
    throw new Error(`Failed to claim mid-morning automation: ${error.message}`)
  }
  const row = data?.[0]
  return row ? mapRow(row as MidMorningRow) : null
}

async function renewRun(id: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc(
    'renew_newsletter_mid_morning_automation',
    {
      p_run_id: id,
      p_lease_token: leaseToken,
      p_lease_seconds: NEWSLETTER_AUTOMATION_LEASE_SECONDS,
    },
  )
  if (error || !data?.[0]) {
    throw new NewsletterAutomationLeaseLostError(
      'Mid-morning newsletter automation',
    )
  }
}

async function resetRetryNotification(
  id: string,
  leaseToken: string,
  signal?: AbortSignal,
): Promise<NewsletterMidMorningRun> {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'reset_newsletter_mid_morning_retry_notification',
    {
      p_run_id: id,
      p_lease_token: leaseToken,
    },
  )
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  const row = data?.[0]
  if (error) {
    throw new Error(
      `Failed to reset mid-morning retry notification state: ${error.message}`,
    )
  }
  if (!row) {
    throw new NewsletterAutomationLeaseLostError(
      'Mid-morning newsletter automation',
    )
  }
  return mapRow(row as MidMorningRow)
}

async function releaseRun(
  marketDate: string,
  leaseToken: string,
  signal?: AbortSignal,
) {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'release_newsletter_mid_morning_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
    },
  )
  if (signal) query = query.abortSignal(signal)
  const { error } = await query
  if (error) {
    throw new Error(
      `Failed to release mid-morning automation: ${error.message}`,
    )
  }
}

function easternDateBounds(date: string) {
  const atNoon = new Date(`${date}T12:00:00Z`)
  const next = new Date(atNoon)
  next.setUTCDate(next.getUTCDate() + 1)
  const nextDate = next.toISOString().slice(0, 10)
  const offset = (value: string) => {
    const name = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(`${value}T12:00:00Z`))
      .find((part) => part.type === 'timeZoneName')?.value
    const match = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/)
    if (!match) return 0
    const sign = match[1] === '+' ? 1 : -1
    return sign * (Number(match[2]) * 60 + Number(match[3]))
  }
  return {
    start: new Date(
      Date.parse(`${date}T00:00:00Z`) - offset(date) * 60_000,
    ).toISOString(),
    end: new Date(
      Date.parse(`${nextDate}T00:00:00Z`) - offset(nextDate) * 60_000,
    ).toISOString(),
  }
}

async function collectCandidates(
  run: NewsletterMidMorningRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const supabase = getServiceClient()
  const bounds = easternDateBounds(run.marketDate)
  const morning = await supabase
    .from('wiim_runs')
    .select('id')
    .eq('run_type', 'morning')
    .eq('status', 'completed')
    .gte('started_at', bounds.start)
    .lt('started_at', bounds.end)
    .order('started_at', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()
  if (morning.error) {
    throw new Error(`Failed to load the morning WIIM run: ${morning.error.message}`)
  }
  if (!morning.data) {
    throw new Error('The completed morning WIIM run is not available yet.')
  }

  const fetched = await fetchWiimCandidates(signal)
  signal.throwIfAborted()
  const ranked = rankWiimCandidates(fetched.candidates, fetched.candidates.length)
  const symbols = Array.from(
    new Set(
      ranked
        .map((candidate) => candidate.ticker?.trim().toUpperCase())
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ).slice(0, CANDIDATE_COUNT)
  if (symbols.length < 5) {
    throw new Error(
      `Only ${symbols.length} live candidates were available for the mid-morning report.`,
    )
  }
  return updateRun(run.id, leaseToken, {
    stage: 'finviz',
    candidate_symbols: symbols,
    candidate_count: symbols.length,
    morning_wiim_run_id: morning.data.id,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      collectedAt: fetched.generatedAt,
      marketCandidateCount: fetched.marketCandidateCount,
      finvizAttempts: {},
      summaryAttempts: {},
    } as unknown as Json,
  }, signal)
}

async function loadFinvizCoverage(
  run: NewsletterMidMorningRun,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  const coverage = new Map<string, { status: string; fetchedAt: string }>()
  let query = supabase
    .from('stock_why_moving_cache')
    .select('symbol, status, fetched_at')
    .in('symbol', run.candidateSymbols)
    .gte('fetched_at', run.startedAt ?? run.createdAt)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to inspect Finviz coverage: ${error.message}`)
  }
  for (const row of data ?? []) {
    coverage.set(row.symbol, {
      status: row.status,
      fetchedAt: row.fetched_at,
    })
  }
  signal?.throwIfAborted()
  return coverage
}

async function refreshFinvizBatch(
  run: NewsletterMidMorningRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const attempts = stringNumberMap(run.metadata.finvizAttempts)
  const before = await loadFinvizCoverage(run, signal)
  const beforeState = getFinvizCoverageState(
    run.candidateSymbols,
    before,
    attempts,
    MAX_SOURCE_ATTEMPTS,
  )
  const batch = beforeState.retryableSymbols.slice(0, FINVIZ_BATCH_SIZE)
  const results: WarmResult[] = []
  const checkpointAttempt = createFinvizAttemptCheckpointer(
    attempts,
    async (snapshot, symbol) => {
      await updateRun(run.id, leaseToken, {
        metadata_json: {
          ...run.metadata,
          finvizAttempts: snapshot,
          finvizLastDispatchedSymbol: symbol,
          finvizAttemptsCheckpointAt: new Date().toISOString(),
        } as Json,
      }, signal)
    },
  )
  const warmResults = await Promise.allSettled(
    batch.map(async (symbol) => {
      await checkpointAttempt(symbol)
      signal.throwIfAborted()
      const result = await warmSymbol(symbol, {
        dryRun: false,
        forceRefresh: true,
        perSymbolPauseMs: 200,
        jitterMs: 100,
        signal,
      })
      results.push(result)
    }),
  )
  const warmFailure = warmResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (warmFailure) throw warmFailure.reason
  signal.throwIfAborted()
  const after = await loadFinvizCoverage(run, signal)
  signal.throwIfAborted()
  const afterState = getFinvizCoverageState(
    run.candidateSymbols,
    after,
    attempts,
    MAX_SOURCE_ATTEMPTS,
  )
  return updateRun(run.id, leaseToken, {
    stage: afterState.done ? 'wiim' : 'finviz',
    finviz_completed_count: afterState.completedCount,
    finviz_found_count: afterState.foundCount,
    finviz_error_count: afterState.errorSymbols.length,
    last_error:
      afterState.exhaustedSymbols.length > 0
        ? `${afterState.exhaustedSymbols.length} Finviz refreshes exhausted retries.`
        : null,
    metadata_json: {
      ...run.metadata,
      finvizAttempts: attempts,
      finvizLastBatch: batch,
      finvizLastBatchSummary: summarizeWarmResults(results),
      finvizExhaustedSymbols: afterState.exhaustedSymbols,
    } as unknown as Json,
  }, signal)
}

async function createMidMorningWiim(
  run: NewsletterMidMorningRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  const wiim = await runWiimBrief({
    runType: 'mid_morning',
    compareRunType: 'morning',
    compareLatest: true,
    label: 'WIIM Automated Mid-Morning Delta',
    persist: true,
    signal,
  })
  if (!wiim.runId) {
    throw new Error('The mid-morning WIIM run did not return a persisted ID.')
  }
  const topFiveSymbols = wiim.topFive.flatMap((candidate) =>
    candidate.ticker ? [candidate.ticker] : [],
  )
  return updateRun(run.id, leaseToken, {
    stage: 'summaries',
    mid_morning_wiim_run_id: wiim.runId,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      wiimGeneratedAt: wiim.generatedAt,
      topCandidate: wiim.topCandidate,
      topFiveSymbols,
      delta: wiim.metadata.delta ?? null,
    } as Json,
  }, signal)
}

async function loadFreshSummaryCoverage(
  runId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  let query = supabase
    .from('stock_summaries')
    .select('symbol, summary_text, no_summary_reason')
    .eq('run_id', runId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(
      `Failed to inspect mid-morning summaries: ${error.message}`,
    )
  }
  signal?.throwIfAborted()
  return classifySummaryCoverage(data ?? [])
}

async function generateSummaryBatch(
  run: NewsletterMidMorningRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const symbols = stringArray(run.metadata.topFiveSymbols)
  if (symbols.length === 0) {
    throw new Error('The mid-morning WIIM run did not produce a top five.')
  }
  const summaryRunId = `newsletter_mid_morning_${run.id}`
  const before = await loadFreshSummaryCoverage(summaryRunId, signal)
  const attempts = stringNumberMap(run.metadata.summaryAttempts)
  const retryable = symbols.filter(
    (symbol) =>
      !before.completedSymbols.has(symbol) &&
      (attempts[symbol] ?? 0) < MAX_SOURCE_ATTEMPTS,
  )
  const result = await generateDailySummaryBatch({
    marketDate: run.marketDate,
    symbols: retryable,
    runSymbols: symbols,
    runId: summaryRunId,
    limit: 5,
    concurrency: 4,
    perSymbolTimeoutMs: 35_000,
    force: true,
    signal,
    onBatchDispatched: async (symbols) => {
      for (const symbol of symbols) {
        attempts[symbol] = (attempts[symbol] ?? 0) + 1
      }
      await updateRun(run.id, leaseToken, {
        metadata_json: {
          ...run.metadata,
          summaryAttempts: { ...attempts },
          summaryLastDispatchedBatch: symbols,
          summaryAttemptsCheckpointAt: new Date().toISOString(),
        } as Json,
      }, signal)
    },
  })
  const after = await loadFreshSummaryCoverage(summaryRunId, signal)
  signal.throwIfAborted()
  const exhausted = symbols.filter(
    (symbol) =>
      !after.completedSymbols.has(symbol) &&
      (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completed = after.completedSymbols.size + exhausted.length
  return updateRun(run.id, leaseToken, {
    stage: completed >= symbols.length ? 'finalizing' : 'summaries',
    summary_completed_count: completed,
    summary_generated_count: after.generatedSymbols.size,
    summary_error_count: exhausted.length,
    last_error:
      exhausted.length > 0
        ? `${exhausted.length} updated summaries exhausted retries.`
        : null,
    metadata_json: {
      ...run.metadata,
      summaryAttempts: attempts,
      summaryRunId,
      summaryLastFailures: result.failed,
      summaryExhaustedSymbols: exhausted,
      summaryNoResultSymbols: Array.from(after.noResultSymbols),
      summaryValidationRejectedSymbols: Array.from(
        after.validationRejectedSymbols,
      ),
    } as Json,
  }, signal)
}

async function notifyCompletion(
  run: NewsletterMidMorningRun,
  signal?: AbortSignal,
) {
  const scopes = await listEnabledNewsletterDailyScopes(signal)
  if (scopes.length === 0) {
    throw new Error('No enabled newsletter scope can receive the terminal alert.')
  }
  const delta = isRecord(run.metadata.delta) ? run.metadata.delta : {}
  const notable = Array.isArray(delta.notableText)
    ? delta.notableText.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const topFive = stringArray(run.metadata.topFiveSymbols)
  const degraded = run.status === 'partial'
  const upstreamErrors = run.finvizErrorCount + run.summaryErrorCount
  await Promise.all(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'mid_morning_completed',
        severity: degraded || run.meaningfulChange ? 'warning' : 'success',
        title: degraded
          ? 'Mid-morning report completed with coverage gaps'
          : run.meaningfulChange
            ? 'Mid-morning report found meaningful changes'
            : 'Mid-morning report is ready',
        message: [
          notable[0] ??
            `Updated leaders: ${topFive.join(', ')}. Morning calls are otherwise holding.`,
          degraded
            ? `${run.summaryGeneratedCount} of ${topFive.length} summaries were generated; ${upstreamErrors} upstream errors remain.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        actionUrl: '/dashboard/mid-morning-brief',
        metadata: {
          midMorningRunId: run.id,
          wiimRunId: run.midMorningWiimRunId,
          meaningfulChange: run.meaningfulChange,
          topFive,
          delta,
        },
        dedupeKey: `mid-morning-completed:${run.marketDate}`,
        signal,
      }),
    ),
  )
}

async function finalizeRun(
  run: NewsletterMidMorningRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const delta = isRecord(run.metadata.delta) ? run.metadata.delta : {}
  const meaningfulChange = delta.shouldNotify === true
  const targetCount = stringArray(run.metadata.topFiveSymbols).length
  const finalStatus = getMidMorningAutomationFinalStatus({
    targetCount,
    generatedCount: run.summaryGeneratedCount,
    finvizErrorCount: run.finvizErrorCount,
    summaryErrorCount: run.summaryErrorCount,
  })
  const upstreamErrors = run.finvizErrorCount + run.summaryErrorCount
  const completedAt = new Date().toISOString()
  const completed = await updateRun(run.id, leaseToken, {
    status: finalStatus,
    stage: finalStatus === 'failed' ? 'failed' : 'completed',
    meaningful_change: meaningfulChange,
    completed_at: completedAt,
    last_error:
      finalStatus === 'completed'
        ? null
        : finalStatus === 'failed'
          ? `Mid-morning report produced no usable summaries; ${upstreamErrors} upstream errors remain.`
          : `Mid-morning report completed with ${run.summaryGeneratedCount} of ${targetCount} summaries and ${upstreamErrors} upstream errors.`,
    metadata_json: {
      ...run.metadata,
      reportReadyAt: completedAt,
      ...(finalStatus === 'failed'
        ? {
            failureKind: 'quality_gate',
            lastFailureStage: 'finalizing',
          }
        : {}),
    } as Json,
  }, signal)
  return completed
}

async function notifyFailure(
  run: NewsletterMidMorningRun,
  failedStage: NewsletterMidMorningStage,
  signal?: AbortSignal,
) {
  const scopes = await listEnabledNewsletterDailyScopes(signal)
  if (scopes.length === 0) {
    throw new Error('No enabled newsletter scope can receive the terminal alert.')
  }
  const qualityGateFailure = run.metadata.failureKind === 'quality_gate'
  await Promise.all(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'mid_morning_failed',
        severity: 'error',
        title: qualityGateFailure
          ? 'Mid-morning report did not pass its quality gate'
          : 'Mid-morning report automation stopped',
        message: qualityGateFailure
          ? (run.lastError ?? 'The report did not produce a usable summary.')
          : `${getMidMorningAutomationStageLabel(failedStage)} failed after ${MAX_STAGE_ERRORS} attempts. ${run.lastError ?? ''}`.trim(),
        actionUrl: '/dashboard/mid-morning-brief',
        metadata: {
          midMorningRunId: run.id,
          stage: failedStage,
          error: run.lastError,
        },
        dedupeKey: `mid-morning-failed:${run.marketDate}:${failedStage}`,
        signal,
      }),
    ),
  )
}

async function recordMidMorningNotificationAttempt(
  run: NewsletterMidMorningRun,
  succeeded: boolean,
  error: string | null,
  signal?: AbortSignal,
): Promise<NewsletterMidMorningRun> {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'record_newsletter_mid_morning_notification_attempt',
    {
      p_run_id: run.id,
      p_succeeded: succeeded,
      p_error: error,
    },
  )
  if (signal) query = query.abortSignal(signal)
  const result = await query
  const row = result.data?.[0]
  if (result.error || !row) {
    throw new Error(
      `Failed to record mid-morning notification attempt: ${
        result.error?.message ?? 'No terminal run returned'
      }`,
    )
  }
  return mapRow(row as MidMorningRow)
}

export async function ensureNewsletterMidMorningTerminalNotification(
  run: NewsletterMidMorningRun,
  signal?: AbortSignal,
): Promise<NewsletterMidMorningRun> {
  signal?.throwIfAborted()
  if (run.notificationAppliedAt) return run
  if (!['completed', 'partial', 'failed'].includes(run.status)) return run

  try {
    if (run.status === 'failed') {
      await notifyFailure(
        run,
        retryableStage(run.metadata.lastFailureStage),
        signal,
      )
    } else {
      await notifyCompletion(run, signal)
    }
    return await recordMidMorningNotificationAttempt(run, true, null, signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordMidMorningNotificationAttempt(run, false, message, signal).catch(
      () => undefined,
    )
    throw new Error(`Mid-morning terminal notification is pending: ${message}`, {
      cause: error,
    })
  }
}

export async function advanceNewsletterMidMorningAutomation(input: {
  marketDate: string
  retryFailed?: boolean
  stageBudgetMs?: number
}): Promise<{
  claimed: boolean
  action: string
  run: NewsletterMidMorningRun
}> {
  const leaseToken = crypto.randomUUID()
  const claimed = await claimRun(input.marketDate, leaseToken)
  if (!claimed) {
    const run = await getNewsletterMidMorningRun(input.marketDate)
    if (!run) {
      throw new Error('Mid-morning automation is locked but no run was found.')
    }
    return { claimed: false, action: 'locked', run }
  }

  let current = claimed
  const stageBudgetMs = Math.max(
    1,
    Math.min(
      NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
      Math.floor(
        input.stageBudgetMs ?? NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
      ),
    ),
  )
  try {
    return await runWithNewsletterAutomationLease({
      renew: () => renewRun(current.id, leaseToken),
      budgetMs: stageBudgetMs,
      task: async (signal) => {
        if (current.status === 'completed' || current.status === 'partial') {
          try {
            current = await ensureNewsletterMidMorningTerminalNotification(
              current,
              signal,
            )
            return { claimed: true, action: 'already-completed', run: current }
          } catch {
            return { claimed: true, action: 'notification-pending', run: current }
          }
        }
        switch (current.stage) {
          case 'collecting':
            current = await collectCandidates(current, leaseToken, signal)
            return { claimed: true, action: 'candidates-collected', run: current }
          case 'finviz':
            current = await refreshFinvizBatch(current, leaseToken, signal)
            return { claimed: true, action: 'finviz-batch', run: current }
          case 'wiim':
            current = await createMidMorningWiim(current, leaseToken, signal)
            return { claimed: true, action: 'wiim-generated', run: current }
          case 'summaries':
            current = await generateSummaryBatch(current, leaseToken, signal)
            return { claimed: true, action: 'summary-batch', run: current }
          case 'finalizing':
            current = await finalizeRun(current, leaseToken, signal)
            try {
              current = await ensureNewsletterMidMorningTerminalNotification(
                current,
                signal,
              )
              return { claimed: true, action: 'report-finalized', run: current }
            } catch {
              return { claimed: true, action: 'notification-pending', run: current }
            }
          case 'completed':
            try {
              current = await ensureNewsletterMidMorningTerminalNotification(
                current,
                signal,
              )
              return { claimed: true, action: 'already-completed', run: current }
            } catch {
              return { claimed: true, action: 'notification-pending', run: current }
            }
          case 'failed': {
            if (!input.retryFailed) {
              return { claimed: true, action: 'failed-terminal', run: current }
            }
            const retryStage = retryableStage(current.metadata.lastFailureStage)
            const stageErrorCounts = stringNumberMap(
              current.metadata.stageErrorCounts,
            )
            delete stageErrorCounts[retryStage]
            current = await resetRetryNotification(
              current.id,
              leaseToken,
              signal,
            )
            current = await updateRun(current.id, leaseToken, {
              status: 'running',
              stage: retryStage,
              completed_at: null,
              last_error: null,
              metadata_json: {
                ...current.metadata,
                stageErrorCounts,
                manualRetryAt: new Date().toISOString(),
                manualRetryStage: retryStage,
              } as Json,
            }, signal)
            return { claimed: true, action: 'failed-stage-resumed', run: current }
          }
        }
      },
    })
  } catch (error) {
    if (error instanceof NewsletterAutomationStageBudgetError) {
      return {
        claimed: true,
        action: 'invocation-budget-exhausted',
        run: current,
      }
    }
    if (error instanceof NewsletterAutomationLeaseLostError) {
      return { claimed: false, action: 'lease-lost', run: current }
    }
    const failedStage = current.stage
    const message = error instanceof Error ? error.message : String(error)
    const stageErrors = stringNumberMap(current.metadata.stageErrorCounts)
    const count = (stageErrors[failedStage] ?? 0) + 1
    stageErrors[failedStage] = count
    const terminal = count >= MAX_STAGE_ERRORS
    const cleanupSignal = AbortSignal.timeout(5_000)
    current = await updateRun(current.id, leaseToken, {
      status: terminal ? 'failed' : 'running',
      stage: terminal ? 'failed' : failedStage,
      last_error: message,
      completed_at: terminal ? new Date().toISOString() : null,
      metadata_json: {
        ...current.metadata,
        stageErrorCounts: stageErrors,
        lastFailureAt: new Date().toISOString(),
        lastFailureStage: failedStage,
      } as Json,
    }, cleanupSignal)
    if (terminal) {
      try {
        current = await ensureNewsletterMidMorningTerminalNotification(
          current,
          cleanupSignal,
        )
      } catch {
        return { claimed: true, action: 'notification-pending', run: current }
      }
    }
    return { claimed: true, action: 'stage-error', run: current }
  } finally {
    await releaseRun(
      input.marketDate,
      leaseToken,
      AbortSignal.timeout(5_000),
    ).catch(() => undefined)
  }
}

export const __testOnly = {
  mapRow,
  stringNumberMap,
  stringArray,
  retryableStage,
  collectCandidates,
  loadFinvizCoverage,
  loadFreshSummaryCoverage,
}
