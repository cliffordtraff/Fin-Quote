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
  patch: Database['public']['Tables']['newsletter_mid_morning_runs']['Update'],
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
      `Failed to update mid-morning automation: ${
        error?.message ?? 'No row returned'
      }`,
    )
  }
  return mapRow(data as MidMorningRow)
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
      p_lease_seconds: 90,
    },
  )
  if (error) {
    throw new Error(`Failed to claim mid-morning automation: ${error.message}`)
  }
  const row = data?.[0]
  return row ? mapRow(row as MidMorningRow) : null
}

async function releaseRun(marketDate: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { error } = await supabase.rpc(
    'release_newsletter_mid_morning_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
    },
  )
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

async function collectCandidates(run: NewsletterMidMorningRun) {
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
    .maybeSingle()
  if (morning.error) {
    throw new Error(`Failed to load the morning WIIM run: ${morning.error.message}`)
  }
  if (!morning.data) {
    throw new Error('The completed morning WIIM run is not available yet.')
  }

  const fetched = await fetchWiimCandidates()
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
  return updateRun(run.id, {
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
  })
}

async function loadFinvizCoverage(run: NewsletterMidMorningRun) {
  const supabase = getServiceClient()
  const coverage = new Map<string, { status: string; fetchedAt: string }>()
  const { data, error } = await supabase
    .from('stock_why_moving_cache')
    .select('symbol, status, fetched_at')
    .in('symbol', run.candidateSymbols)
    .gte('fetched_at', run.startedAt ?? run.createdAt)
  if (error) {
    throw new Error(`Failed to inspect Finviz coverage: ${error.message}`)
  }
  for (const row of data ?? []) {
    coverage.set(row.symbol, {
      status: row.status,
      fetchedAt: row.fetched_at,
    })
  }
  return coverage
}

async function refreshFinvizBatch(run: NewsletterMidMorningRun) {
  const attempts = stringNumberMap(run.metadata.finvizAttempts)
  const before = await loadFinvizCoverage(run)
  const batch = run.candidateSymbols
    .filter(
      (symbol) =>
        !before.has(symbol) &&
        (attempts[symbol] ?? 0) < MAX_SOURCE_ATTEMPTS,
    )
    .slice(0, FINVIZ_BATCH_SIZE)
  const results: WarmResult[] = []
  await Promise.all(
    batch.map(async (symbol) => {
      const result = await warmSymbol(symbol, {
        dryRun: false,
        forceRefresh: true,
        perSymbolPauseMs: 200,
        jitterMs: 100,
      })
      attempts[symbol] = (attempts[symbol] ?? 0) + 1
      results.push(result)
    }),
  )
  const after = await loadFinvizCoverage(run)
  const exhausted = run.candidateSymbols.filter(
    (symbol) =>
      !after.has(symbol) &&
      (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completed = after.size + exhausted.length
  const done = completed >= run.candidateSymbols.length
  return updateRun(run.id, {
    stage: done ? 'wiim' : 'finviz',
    finviz_completed_count: completed,
    finviz_found_count: Array.from(after.values()).filter(
      (entry) => entry.status === 'found',
    ).length,
    finviz_error_count:
      exhausted.length +
      Array.from(after.values()).filter((entry) => entry.status === 'error')
        .length,
    last_error:
      exhausted.length > 0
        ? `${exhausted.length} Finviz refreshes exhausted retries.`
        : null,
    metadata_json: {
      ...run.metadata,
      finvizAttempts: attempts,
      finvizLastBatch: batch,
      finvizLastBatchSummary: summarizeWarmResults(results),
      finvizExhaustedSymbols: exhausted,
    } as unknown as Json,
  })
}

async function createMidMorningWiim(run: NewsletterMidMorningRun) {
  const wiim = await runWiimBrief({
    runType: 'mid_morning',
    compareRunType: 'morning',
    compareLatest: true,
    label: 'WIIM Automated Mid-Morning Delta',
    persist: true,
  })
  if (!wiim.runId) {
    throw new Error('The mid-morning WIIM run did not return a persisted ID.')
  }
  const topFiveSymbols = wiim.topFive.flatMap((candidate) =>
    candidate.ticker ? [candidate.ticker] : [],
  )
  return updateRun(run.id, {
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
  })
}

async function loadFreshSummarySymbols(runId: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('stock_summaries')
    .select('symbol, summary_text, no_summary_reason')
    .eq('run_id', runId)
  if (error) {
    throw new Error(
      `Failed to inspect mid-morning summaries: ${error.message}`,
    )
  }
  return new Set((data ?? []).map((row) => row.symbol))
}

async function generateSummaryBatch(run: NewsletterMidMorningRun) {
  const symbols = stringArray(run.metadata.topFiveSymbols)
  if (symbols.length === 0) {
    throw new Error('The mid-morning WIIM run did not produce a top five.')
  }
  const summaryRunId = `newsletter_mid_morning_${run.id}`
  const completedBefore = await loadFreshSummarySymbols(summaryRunId)
  const attempts = stringNumberMap(run.metadata.summaryAttempts)
  const retryable = symbols.filter(
    (symbol) =>
      !completedBefore.has(symbol) &&
      (attempts[symbol] ?? 0) < MAX_SOURCE_ATTEMPTS,
  )
  const result = await generateDailySummaryBatch({
    marketDate: run.marketDate,
    symbols: retryable,
    runId: summaryRunId,
    limit: 5,
    concurrency: 4,
    perSymbolTimeoutMs: 45_000,
    force: true,
  })
  for (const symbol of result.attemptedSymbols) {
    attempts[symbol] = (attempts[symbol] ?? 0) + 1
  }
  const completedAfter = await loadFreshSummarySymbols(summaryRunId)
  const exhausted = symbols.filter(
    (symbol) =>
      !completedAfter.has(symbol) &&
      (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completed = completedAfter.size + exhausted.length
  return updateRun(run.id, {
    stage: completed >= symbols.length ? 'finalizing' : 'summaries',
    summary_completed_count: completed,
    summary_generated_count: completedAfter.size,
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
    } as Json,
  })
}

async function notifyCompletion(run: NewsletterMidMorningRun) {
  const scopes = await listEnabledNewsletterDailyScopes()
  const delta = isRecord(run.metadata.delta) ? run.metadata.delta : {}
  const notable = Array.isArray(delta.notableText)
    ? delta.notableText.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const topFive = stringArray(run.metadata.topFiveSymbols)
  await Promise.allSettled(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'mid_morning_completed',
        severity: run.meaningfulChange ? 'warning' : 'success',
        title: run.meaningfulChange
          ? 'Mid-morning report found meaningful changes'
          : 'Mid-morning report is ready',
        message:
          notable[0] ??
          `Updated leaders: ${topFive.join(', ')}. Morning calls are otherwise holding.`,
        actionUrl: '/dashboard/mid-morning-brief',
        metadata: {
          midMorningRunId: run.id,
          wiimRunId: run.midMorningWiimRunId,
          meaningfulChange: run.meaningfulChange,
          topFive,
          delta,
        },
        dedupeKey: `mid-morning-completed:${run.marketDate}`,
      }),
    ),
  )
}

async function finalizeRun(run: NewsletterMidMorningRun) {
  const delta = isRecord(run.metadata.delta) ? run.metadata.delta : {}
  const meaningfulChange = delta.shouldNotify === true
  const completedAt = new Date().toISOString()
  const completed = await updateRun(run.id, {
    status: run.summaryErrorCount > 0 ? 'partial' : 'completed',
    stage: 'completed',
    meaningful_change: meaningfulChange,
    completed_at: completedAt,
    metadata_json: {
      ...run.metadata,
      reportReadyAt: completedAt,
    } as Json,
  })
  await notifyCompletion(completed)
  return completed
}

async function notifyFailure(
  run: NewsletterMidMorningRun,
  failedStage: NewsletterMidMorningStage,
) {
  const scopes = await listEnabledNewsletterDailyScopes()
  await Promise.allSettled(
    scopes.map(({ scope }) =>
      createNewsletterNotification(scope, {
        marketDate: run.marketDate,
        type: 'mid_morning_failed',
        severity: 'error',
        title: 'Mid-morning report automation stopped',
        message: `${getMidMorningAutomationStageLabel(failedStage)} failed after ${MAX_STAGE_ERRORS} attempts. ${run.lastError ?? ''}`.trim(),
        actionUrl: '/dashboard/mid-morning-brief',
        metadata: {
          midMorningRunId: run.id,
          stage: failedStage,
          error: run.lastError,
        },
        dedupeKey: `mid-morning-failed:${run.marketDate}:${failedStage}`,
      }),
    ),
  )
}

export async function advanceNewsletterMidMorningAutomation(input: {
  marketDate: string
  retryFailed?: boolean
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
  try {
    if (current.status === 'completed' || current.status === 'partial') {
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
        current = await createMidMorningWiim(current)
        return { claimed: true, action: 'wiim-generated', run: current }
      case 'summaries':
        current = await generateSummaryBatch(current)
        return { claimed: true, action: 'summary-batch', run: current }
      case 'finalizing':
        current = await finalizeRun(current)
        return { claimed: true, action: 'report-finalized', run: current }
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
          completed_at: null,
          last_error: null,
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
    const count = (stageErrors[failedStage] ?? 0) + 1
    stageErrors[failedStage] = count
    const terminal = count >= MAX_STAGE_ERRORS
    current = await updateRun(current.id, {
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
    })
    if (terminal) await notifyFailure(current, failedStage)
    return { claimed: true, action: 'stage-error', run: current }
  } finally {
    await releaseRun(input.marketDate, leaseToken).catch(() => undefined)
  }
}

export const __testOnly = {
  mapRow,
  stringNumberMap,
  stringArray,
  retryableStage,
}
