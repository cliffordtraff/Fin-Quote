import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { getMarketStatus, type MarketSession } from '@/lib/market-hours'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'
import {
  buildWhyMovedReviewKey,
  ingestWhyMovedEditorialCandidates,
} from '@/lib/why-moved-review'
import type {
  WhyMovedCandidate,
  WhyMovedEditorialDiscovery,
} from '@/lib/why-moved-types'
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
import type { RankedWiimCandidate } from '@/lib/wiim/types'
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
import {
  NEWSLETTER_AUTOMATION_LEASE_SECONDS,
  NEWSLETTER_AUTOMATION_STAGE_BUDGET_MS,
  NewsletterAutomationLeaseLostError,
  NewsletterAutomationStageBudgetError,
  runWithNewsletterAutomationLease,
} from './automation-lease'
import {
  createFinvizAttemptCheckpointer,
  getDailyAutomationFinalStatus,
  getFinvizCoverageState,
} from './automation-coverage'
import { getNewsletterAutomationClock } from './automation-clock'
import { getNewsletterDailyAutomationRun } from './daily-runs-read'

export {
  getNewsletterAutomationClock,
  getNewsletterAutomationWindow,
  type NewsletterAutomationClock,
  type NewsletterAutomationWindow,
} from './automation-clock'
export { hasFinishedNewsletterMorningReport } from './morning-report-readiness'
export { getNewsletterDailyAutomationRun }

const TABLE = 'newsletter_daily_automation_runs'
const FINVIZ_BATCH_SIZE = 2
const FINVIZ_INTER_REQUEST_PAUSE_MS = 10_000
const FINVIZ_INTER_REQUEST_JITTER_MS = 6_000
const FINVIZ_CIRCUIT_COOLDOWN_MS = 45 * 60 * 1_000
const FINVIZ_MAX_CIRCUIT_TRIPS = 2
const FINVIZ_DAILY_REQUEST_BUDGET = 550
const SUMMARY_BATCH_SIZE = 4
const NEWSLETTER_BATCH_SIZE = 3
const MAX_SOURCE_ATTEMPTS = 2
const MAX_STAGE_ERRORS = 3

/**
 * A thin candidate universe is an editorial condition, not a broken pipeline:
 * retrying cannot manufacture stories that the market did not produce. Treating
 * it as a stage error burned through the retry budget and left the run terminal
 * `failed`, which pinned /api/health/newsletter at 503 for the rest of the day.
 */
function isNewsletterQualityGateShortfall(
  stage: NewsletterDailyAutomationStage,
  message: string,
): boolean {
  return stage === 'newsletters' &&
    /^Only \d+ candidates passed the current-news quality gate; \d+ are required for this run\.$/.test(message)
}

function requiresApprovedDailyCandidateSetException(
  metadata: Record<string, unknown>,
): boolean {
  return metadata.exceptionRequired === 'approved_daily_candidate_set'
}

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

type FinvizCircuitMode = 'closed' | 'cooldown' | 'open'

interface FinvizCircuitState {
  mode: FinvizCircuitMode
  tripCount: number
  reason: string | null
  triggeredAt: string | null
  resumeAt: string | null
  recoveredAt: string | null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  )
}

function readFinvizCircuitState(value: unknown): FinvizCircuitState {
  const record = isRecord(value) ? value : {}
  const rawMode = record.mode
  return {
    mode: rawMode === 'cooldown' || rawMode === 'open' ? rawMode : 'closed',
    tripCount: Math.max(0, Math.floor(Number(record.tripCount) || 0)),
    reason: typeof record.reason === 'string' ? record.reason : null,
    triggeredAt:
      typeof record.triggeredAt === 'string' ? record.triggeredAt : null,
    resumeAt: typeof record.resumeAt === 'string' ? record.resumeAt : null,
    recoveredAt:
      typeof record.recoveredAt === 'string' ? record.recoveredAt : null,
  }
}

function orderFinvizRetryableSymbols(
  retryableSymbols: string[],
  queueValue: unknown,
): string[] {
  const retryable = new Set(retryableSymbols)
  const ordered = stringArray(queueValue).filter((symbol) => {
    if (!retryable.has(symbol)) return false
    retryable.delete(symbol)
    return true
  })
  return [...ordered, ...retryable]
}

function isFinvizBlockingResult(result: WarmResult): boolean {
  if (result.status !== 'error') return false
  const message = result.errorMessage?.toLowerCase() ?? ''
  return message.includes('blocking response 403') ||
    message.includes('blocking response 429') ||
    message.includes('access challenge detected')
}

function shouldRunFinvizCanary(
  circuit: FinvizCircuitState,
  now = Date.now(),
): boolean {
  if (circuit.mode !== 'cooldown') return false
  const resumeAt = Date.parse(circuit.resumeAt ?? '')
  return Number.isFinite(resumeAt) && now >= resumeAt
}

function waitWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
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
  leaseToken: string,
  patch: Database['public']['Tables']['newsletter_daily_automation_runs']['Update'],
  signal?: AbortSignal,
) {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'update_newsletter_daily_automation_claim',
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
      `Failed to update newsletter automation: ${error.message}`,
    )
  }
  const row = data?.[0]
  if (!row) {
    throw new NewsletterAutomationLeaseLostError('Daily newsletter automation')
  }
  return mapRow(row as AutomationRow)
}

export async function getPendingNewsletterDailyTerminalNotification(
  beforeMarketDate: string,
): Promise<NewsletterDailyAutomationRun | null> {
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
      `Failed to load pending morning notification: ${error.message}`,
    )
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

async function claimRun(marketDate: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc(
    'claim_newsletter_daily_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
      p_lease_seconds: NEWSLETTER_AUTOMATION_LEASE_SECONDS,
    },
  )
  if (error) {
    throw new Error(`Failed to claim newsletter automation: ${error.message}`)
  }
  const row = data?.[0]
  return row ? mapRow(row as AutomationRow) : null
}

async function renewRun(id: string, leaseToken: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc(
    'renew_newsletter_daily_automation',
    {
      p_run_id: id,
      p_lease_token: leaseToken,
      p_lease_seconds: NEWSLETTER_AUTOMATION_LEASE_SECONDS,
    },
  )
  if (error || !data?.[0]) {
    throw new NewsletterAutomationLeaseLostError('Daily newsletter automation')
  }
}

async function resetRetryNotification(
  id: string,
  leaseToken: string,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun> {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'reset_newsletter_daily_retry_notification',
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
      `Failed to reset retry notification state: ${error.message}`,
    )
  }
  if (!row) {
    throw new NewsletterAutomationLeaseLostError('Daily newsletter automation')
  }
  return mapRow(row as AutomationRow)
}

async function releaseRun(
  marketDate: string,
  leaseToken: string,
  signal?: AbortSignal,
) {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'release_newsletter_daily_automation',
    {
      p_market_date: marketDate,
      p_lease_token: leaseToken,
    },
  )
  if (signal) query = query.abortSignal(signal)
  const { error } = await query
  if (error) {
    throw new Error(`Failed to release newsletter automation: ${error.message}`)
  }
}

async function collectCandidates(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const fetched = await fetchWiimCandidates(signal)
  signal.throwIfAborted()
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
  return updateRun(run.id, leaseToken, {
    stage: 'finviz',
    candidate_symbols: symbols,
    candidate_count: symbols.length,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      marketCandidateCount: fetched.marketCandidateCount,
      candidateSnapshotAt: fetched.generatedAt,
      // The ranker is best-first. Crawl it in reverse so likely newsletter
      // stories are refreshed closest to the editorial deadline.
      finvizQueueSymbols: [...symbols].reverse(),
      finvizAttempts: {},
      finvizRequestCount: 0,
      finvizCircuitBreaker: {
        mode: 'closed',
        tripCount: 0,
        reason: null,
        triggeredAt: null,
        resumeAt: null,
        recoveredAt: null,
      },
      summaryAttempts: {},
    } as unknown as Json,
  }, signal)
}

async function loadFinvizCoverage(
  run: NewsletterDailyAutomationRun,
  signal?: AbortSignal,
): Promise<Map<string, { status: string; fetchedAt: string }>> {
  signal?.throwIfAborted()
  const supabase = getServiceClient()
  const coverage = new Map<string, { status: string; fetchedAt: string }>()
  const since = run.startedAt ?? run.createdAt
  for (let index = 0; index < run.candidateSymbols.length; index += 100) {
    const batch = run.candidateSymbols.slice(index, index + 100)
    let query = supabase
      .from('stock_why_moving_cache')
      .select('symbol, status, fetched_at')
      .in('symbol', batch)
      .gte('fetched_at', since)
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
  }
  signal?.throwIfAborted()
  return coverage
}

async function refreshFinvizBatch(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const attempts = stringNumberMap(run.metadata.finvizAttempts)
  const circuit = readFinvizCircuitState(run.metadata.finvizCircuitBreaker)
  let requestCount = Math.max(
    0,
    Math.floor(Number(run.metadata.finvizRequestCount) || 0),
  )
  const now = Date.now()
  const canary = shouldRunFinvizCanary(circuit, now)
  const coolingDown = circuit.mode === 'cooldown' && !canary
  const budgetExhausted = requestCount >= FINVIZ_DAILY_REQUEST_BUDGET

  if (circuit.mode === 'open' || coolingDown || budgetExhausted) {
    const reason = circuit.mode === 'open'
      ? `Finviz circuit breaker is open for the day: ${circuit.reason ?? 'access protection triggered'}.`
      : coolingDown
        ? `Finviz circuit breaker is cooling down until ${circuit.resumeAt}.`
        : `Finviz daily request budget of ${FINVIZ_DAILY_REQUEST_BUDGET} is exhausted.`
    return updateRun(run.id, leaseToken, {
      last_error: reason,
      metadata_json: {
        ...run.metadata,
        finvizRequestCount: requestCount,
        finvizBudgetExhausted: budgetExhausted,
      } as unknown as Json,
    }, signal)
  }

  const before = await loadFinvizCoverage(run, signal)
  const beforeState = getFinvizCoverageState(
    run.candidateSymbols,
    before,
    attempts,
    MAX_SOURCE_ATTEMPTS,
  )
  const orderedRetryable = orderFinvizRetryableSymbols(
    beforeState.retryableSymbols,
    run.metadata.finvizQueueSymbols,
  )
  const remainingBudget = FINVIZ_DAILY_REQUEST_BUDGET - requestCount
  const batch = orderedRetryable.slice(
    0,
    Math.min(canary ? 1 : FINVIZ_BATCH_SIZE, remainingBudget),
  )
  const results: WarmResult[] = []
  const checkpointAttempt = createFinvizAttemptCheckpointer(
    attempts,
    async (snapshot, symbol) => {
      await updateRun(run.id, leaseToken, {
        metadata_json: {
          ...run.metadata,
          finvizAttempts: snapshot,
          finvizRequestCount: requestCount,
          finvizLastDispatchedSymbol: symbol,
          finvizAttemptsCheckpointAt: new Date().toISOString(),
        } as Json,
      }, signal)
    },
  )
  for (let index = 0; index < batch.length; index += 1) {
    const symbol = batch[index]
    requestCount += 1
    await checkpointAttempt(symbol)
    signal.throwIfAborted()
    const result = await warmSymbol(symbol, {
      dryRun: false,
      forceRefresh: true,
      // The durable automation owns retries. One physical request here keeps
      // the daily ceiling honest and prevents hidden retry bursts.
      liveAttempts: 1,
      perSymbolPauseMs: 0,
      jitterMs: 0,
      signal,
    })
    results.push(result)
    if (isFinvizBlockingResult(result)) break
    if (index < batch.length - 1) {
      const jitter = Math.floor(
        Math.random() * FINVIZ_INTER_REQUEST_JITTER_MS,
      )
      await waitWithSignal(
        FINVIZ_INTER_REQUEST_PAUSE_MS + jitter,
        signal,
      )
    }
  }

  const after = await loadFinvizCoverage(run, signal)
  signal.throwIfAborted()
  const afterState = getFinvizCoverageState(
    run.candidateSymbols,
    after,
    attempts,
    MAX_SOURCE_ATTEMPTS,
  )
  const liveSummary = summarizeWarmResults(results)
  const blockingResult = results.find(isFinvizBlockingResult)
  const repeatedUnknownErrors =
    results.length > 0 &&
    (canary || results.length >= FINVIZ_BATCH_SIZE) &&
    results.every((result) => result.status === 'error')
  const tripped = Boolean(blockingResult || repeatedUnknownErrors)
  const tripReason = blockingResult?.errorMessage ??
    (repeatedUnknownErrors ? 'Repeated unrecognized Finviz responses' : null)
  const nextTripCount = tripped ? circuit.tripCount + 1 : circuit.tripCount
  const nextCircuit: FinvizCircuitState = tripped
    ? {
        mode: nextTripCount >= FINVIZ_MAX_CIRCUIT_TRIPS ? 'open' : 'cooldown',
        tripCount: nextTripCount,
        reason: tripReason,
        triggeredAt: new Date(now).toISOString(),
        resumeAt: nextTripCount >= FINVIZ_MAX_CIRCUIT_TRIPS
          ? null
          : new Date(now + FINVIZ_CIRCUIT_COOLDOWN_MS).toISOString(),
        recoveredAt: circuit.recoveredAt,
      }
    : canary
      ? {
          ...circuit,
          mode: 'closed',
          reason: null,
          resumeAt: null,
          recoveredAt: new Date(now).toISOString(),
        }
      : circuit
  const circuitMessage = nextCircuit.mode === 'open'
    ? `Finviz circuit breaker opened for the day: ${nextCircuit.reason}.`
    : nextCircuit.mode === 'cooldown'
      ? `Finviz circuit breaker paused requests until ${nextCircuit.resumeAt}.`
      : null
  return updateRun(run.id, leaseToken, {
    stage: afterState.done && nextCircuit.mode === 'closed' ? 'wiim' : 'finviz',
    finviz_completed_count: afterState.completedCount,
    finviz_found_count: afterState.foundCount,
    finviz_error_count: afterState.errorSymbols.length,
    last_error:
      circuitMessage ?? (afterState.exhaustedSymbols.length > 0
        ? `${afterState.exhaustedSymbols.length} Finviz symbols exhausted automatic retries.`
        : null),
    metadata_json: {
      ...run.metadata,
      finvizAttempts: attempts,
      finvizRequestCount: requestCount,
      finvizCircuitBreaker: nextCircuit,
      finvizLastBatch: batch,
      finvizLastBatchSummary: liveSummary,
      finvizExhaustedSymbols: afterState.exhaustedSymbols,
      finvizCompletedAt: afterState.done ? new Date().toISOString() : null,
    } as unknown as Json,
  }, signal)
}

function missingWiimCatalyst(
  symbol: string,
  generatedAt: string,
  message = 'No discovery-time Finviz catalyst was available for this mover.',
): StockWhyMovingResult {
  return {
    symbol,
    status: 'not_found',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt: generatedAt,
    errorMessage: message,
  }
}

function buildWhyMovedDiscoveriesFromWiim(input: {
  rankedCandidates: RankedWiimCandidate[]
  marketDate: string
  session: MarketSession
  generatedAt: string
  limitPerDirection?: number
}): WhyMovedEditorialDiscovery[] {
  const limit = Math.max(1, Math.min(10, input.limitPerDirection ?? 5))
  const selected: Array<{
    ranked: RankedWiimCandidate
    direction: 'gainer' | 'loser'
  }> = [
    ...input.rankedCandidates
      .filter((candidate) => candidate.metadata.changesPercentage > 0)
      .slice(0, limit)
      .map((ranked) => ({ ranked, direction: 'gainer' as const })),
    ...input.rankedCandidates
      .filter((candidate) => candidate.metadata.changesPercentage < 0)
      .slice(0, limit)
      .map((ranked) => ({ ranked, direction: 'loser' as const })),
  ]
  const seen = new Set<string>()
  const discoveries: WhyMovedEditorialDiscovery[] = []

  for (const { ranked, direction } of selected) {
    const symbol = (ranked.ticker ?? ranked.metadata.symbol).trim().toUpperCase()
    if (!symbol || seen.has(symbol)) continue
    const { name, price, change, changesPercentage } = ranked.metadata
    if (
      !name.trim() ||
      !Number.isFinite(price) ||
      !Number.isFinite(change) ||
      !Number.isFinite(changesPercentage)
    ) {
      continue
    }
    seen.add(symbol)
    const candidate: WhyMovedCandidate = {
      reviewKey: buildWhyMovedReviewKey({
        marketDate: input.marketDate,
        session: input.session,
        direction,
        symbol,
      }),
      symbol,
      name: name.trim(),
      price,
      change,
      changesPercentage,
      direction,
      session: input.session,
      marketDate: input.marketDate,
    }
    const captured = ranked.metadata.whyMoving
    const catalyst =
      captured?.symbol.trim().toUpperCase() === symbol
        ? captured
        : missingWiimCatalyst(
            symbol,
            input.generatedAt,
            captured
              ? 'The discovery-time catalyst symbol did not match this mover.'
              : undefined,
          )
    discoveries.push({ candidate, catalyst })
  }

  return discoveries
}

async function createWiimSnapshot(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  const wiim = await runWiimBrief({
    runType: 'morning',
    compareLatest: true,
    label: 'WIIM Automated Morning Brief',
    persist: true,
    signal,
  })
  if (!wiim.runId) {
    throw new Error('The automated WIIM run did not return a persisted run ID')
  }
  const generatedAt = new Date(wiim.generatedAt)
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error('The automated WIIM run returned an invalid generatedAt')
  }
  const observedSession = getMarketStatus(generatedAt).session
  const editorialSession = observedSession === 'closed' ? 'cash' : observedSession
  const discoveries = buildWhyMovedDiscoveriesFromWiim({
    rankedCandidates: wiim.rankedCandidates,
    marketDate: run.marketDate,
    session: editorialSession,
    generatedAt: wiim.generatedAt,
  })
  if (discoveries.length === 0) {
    throw new Error('The automated WIIM run produced no editorial discoveries')
  }
  await ingestWhyMovedEditorialCandidates({
    sourceRunId: `wiim:${wiim.runId}`,
    seenAt: wiim.generatedAt,
    discoveries,
  })
  return updateRun(run.id, leaseToken, {
    stage: 'summaries',
    wiim_run_id: wiim.runId,
    last_error: null,
    metadata_json: {
      ...run.metadata,
      wiimGeneratedAt: wiim.generatedAt,
      wiimRankedCandidateCount: wiim.rankedCandidateCount,
      wiimTopCandidate: wiim.topCandidate,
      whyMovedDiscoveryCount: discoveries.length,
    } as Json,
  }, signal)
}

async function generateSummaryBatch(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const attempts = stringNumberMap(run.metadata.summaryAttempts)
  const before = await getDailySummaryCoverage(
    run.marketDate,
    run.candidateSymbols,
    signal,
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
    perSymbolTimeoutMs: 35_000,
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

  const after = await getDailySummaryCoverage(
    run.marketDate,
    run.candidateSymbols,
    signal,
  )
  signal.throwIfAborted()
  const completedAfter = new Set(after.completedSymbols)
  const exhausted = run.candidateSymbols.filter(
    (symbol) =>
      !completedAfter.has(symbol) &&
      (attempts[symbol] ?? 0) >= MAX_SOURCE_ATTEMPTS,
  )
  const completedCount = completedAfter.size + exhausted.length
  const done = completedCount >= run.candidateSymbols.length
  return updateRun(run.id, leaseToken, {
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
  }, signal)
}

function newsletterRunIds(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : [],
    ),
  )
}

type NewsletterDailyChildItem = Pick<
  Database['public']['Tables']['newsletter_daily_run_items']['Row'],
  'run_id' | 'status' | 'retry_count'
>

type NewsletterDailyChildRun = Pick<
  Database['public']['Tables']['newsletter_daily_runs']['Row'],
  | 'id'
  | 'status'
  | 'selected_count'
  | 'generated_count'
  | 'ready_count'
  | 'attention_count'
  | 'failed_count'
>

interface NewsletterDailyTerminalAggregate {
  scopeCount: number
  completedScopeCount: number
  selectedCount: number
  generatedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  hasNonterminalWork: boolean
  hasRetryableWork: boolean
  finalStatus: NewsletterDailyAutomationStatus
}

export interface NewsletterDailyTerminalReconciliation {
  hasDrift: boolean
  aggregate: NewsletterDailyTerminalAggregate
}

export class NewsletterDailyTerminalReconciliationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterDailyTerminalReconciliationError'
  }
}

function assertMappedNewsletterDailyRuns(
  runIds: string[],
  childRuns: NewsletterDailyChildRun[],
) {
  const found = new Set(childRuns.map((childRun) => childRun.id))
  const missing = runIds.filter((runId) => !found.has(runId))
  if (missing.length > 0) {
    throw new NewsletterDailyTerminalReconciliationError(
      `Terminal newsletter reconciliation is missing mapped child runs: ${missing.join(', ')}`,
    )
  }
}

function aggregateNewsletterDailyTerminalState(
  runIds: string[],
  childRuns: NewsletterDailyChildRun[],
  items: NewsletterDailyChildItem[],
  run: NewsletterDailyAutomationRun,
): NewsletterDailyTerminalAggregate {
  const itemGroups = new Map<string, NewsletterDailyChildItem[]>()
  for (const item of items) {
    const group = itemGroups.get(item.run_id) ?? []
    group.push(item)
    itemGroups.set(item.run_id, group)
  }

  let generatedCount = 0
  let readyCount = 0
  let attentionCount = 0
  let failedCount = 0
  let completedScopeCount = 0
  let hasNonterminalWork = false
  let hasRetryableWork = false

  const childRunsById = new Map(
    childRuns.map((childRun) => [childRun.id, childRun]),
  )
  for (const runId of runIds) {
    const childItems = itemGroups.get(runId) ?? []
    const childRun = childRunsById.get(runId)
    if (!childRun) continue

    generatedCount += childRun.generated_count
    readyCount += childRun.ready_count
    attentionCount += childRun.attention_count
    failedCount += childRun.failed_count
    if (childRun.generated_count >= childRun.selected_count) {
      completedScopeCount += 1
    }
    hasNonterminalWork ||= childItems.some(
      (item) => item.status === 'queued' || item.status === 'generating',
    )
    hasRetryableWork ||= childItems.some(
      (item) =>
        (item.status === 'failed' || item.status === 'needs_attention') &&
        item.retry_count < MAX_NEWSLETTER_DAILY_ITEM_RETRIES,
    )
  }
  hasNonterminalWork ||= childRuns.some(
    (childRun) =>
      childRun.status === 'queued' || childRun.status === 'generating',
  )

  const selectedCount = childRuns.reduce(
    (total, childRun) => total + childRun.selected_count,
    0,
  )
  return {
    scopeCount: runIds.length,
    completedScopeCount,
    selectedCount,
    generatedCount,
    readyCount,
    attentionCount,
    failedCount,
    hasNonterminalWork,
    hasRetryableWork,
    finalStatus: getDailyAutomationFinalStatus({
      selectedCount,
      readyCount,
      attentionCount,
      failedCount,
      finvizErrorCount: run.finvizErrorCount,
      summaryErrorCount: run.summaryErrorCount,
    }),
  }
}

function hasNewsletterDailyTerminalDrift(
  run: NewsletterDailyAutomationRun,
  aggregate: NewsletterDailyTerminalAggregate,
): boolean {
  return (
    run.newsletterScopeCount !== aggregate.scopeCount ||
    run.newsletterCompletedScopeCount !== aggregate.completedScopeCount ||
    run.newsletterSelectedCount !== aggregate.selectedCount ||
    run.newsletterGeneratedCount !== aggregate.generatedCount ||
    run.newsletterReadyCount !== aggregate.readyCount ||
    run.newsletterAttentionCount !== aggregate.attentionCount ||
    run.newsletterFailedCount !== aggregate.failedCount ||
    run.status !== aggregate.finalStatus ||
    aggregate.hasNonterminalWork ||
    aggregate.hasRetryableWork
  )
}

export async function getNewsletterDailyTerminalReconciliation(
  run: NewsletterDailyAutomationRun,
  signal?: AbortSignal,
): Promise<NewsletterDailyTerminalReconciliation> {
  signal?.throwIfAborted()
  const runIds = Array.from(
    new Set(Object.values(newsletterRunIds(run.metadata.newsletterRunIds))),
  )
  const emptyAggregate: NewsletterDailyTerminalAggregate = {
    scopeCount: 0,
    completedScopeCount: 0,
    selectedCount: 0,
    generatedCount: 0,
    readyCount: 0,
    attentionCount: 0,
    failedCount: 0,
    hasNonterminalWork: false,
    hasRetryableWork: false,
    finalStatus: getDailyAutomationFinalStatus({
      selectedCount: 0,
      readyCount: 0,
      attentionCount: 0,
      failedCount: 0,
      finvizErrorCount: run.finvizErrorCount,
      summaryErrorCount: run.summaryErrorCount,
    }),
  }
  if (runIds.length === 0) {
    return { hasDrift: false, aggregate: emptyAggregate }
  }

  const supabase = getServiceClient()
  let runsQuery = supabase
    .from('newsletter_daily_runs')
    .select(
      'id, status, selected_count, generated_count, ready_count, attention_count, failed_count',
    )
    .in('id', runIds)
    .eq('market_date', run.marketDate)
  let itemsQuery = supabase
    .from('newsletter_daily_run_items')
    .select('run_id, status, retry_count')
    .in('run_id', runIds)
  if (signal) {
    runsQuery = runsQuery.abortSignal(signal)
    itemsQuery = itemsQuery.abortSignal(signal)
  }
  const [runsResult, itemsResult] = await Promise.all([runsQuery, itemsQuery])
  if (runsResult.error || itemsResult.error) {
    throw new Error(
      `Failed to load terminal newsletter child state: ${
        runsResult.error?.message ?? itemsResult.error?.message
      }`,
    )
  }
  signal?.throwIfAborted()
  const childRuns = (runsResult.data ?? []) as NewsletterDailyChildRun[]
  assertMappedNewsletterDailyRuns(runIds, childRuns)
  const aggregate = aggregateNewsletterDailyTerminalState(
    runIds,
    childRuns,
    (itemsResult.data ?? []) as NewsletterDailyChildItem[],
    run,
  )
  return {
    hasDrift: hasNewsletterDailyTerminalDrift(run, aggregate),
    aggregate,
  }
}

async function reconcileNewsletterDailyTerminalRun(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  reconciliation: NewsletterDailyTerminalReconciliation,
  signal: AbortSignal,
): Promise<NewsletterDailyAutomationRun> {
  const { aggregate } = reconciliation
  const reopen = aggregate.hasNonterminalWork || aggregate.hasRetryableWork
  const completedAt = new Date().toISOString()
  const upstreamErrors = run.finvizErrorCount + run.summaryErrorCount
  return updateRun(run.id, leaseToken, {
    status: reopen ? 'running' : aggregate.finalStatus,
    stage: reopen
      ? 'newsletters'
      : aggregate.finalStatus === 'failed'
        ? 'failed'
        : 'completed',
    newsletter_scope_count: aggregate.scopeCount,
    newsletter_completed_scope_count: aggregate.completedScopeCount,
    newsletter_selected_count: aggregate.selectedCount,
    newsletter_generated_count: aggregate.generatedCount,
    newsletter_ready_count: aggregate.readyCount,
    newsletter_attention_count: aggregate.attentionCount,
    newsletter_failed_count: aggregate.failedCount,
    last_error: reopen
      ? `${aggregate.attentionCount + aggregate.failedCount} newsletter issues need an automatic retry.`
      : aggregate.finalStatus === 'completed'
        ? null
        : aggregate.finalStatus === 'failed'
          ? `Morning report produced no ready newsletter issues; ${upstreamErrors} upstream errors remain.`
          : `Morning report completed with ${upstreamErrors} upstream errors, ${aggregate.attentionCount} attention, and ${aggregate.failedCount} failed issues.`,
    completed_at: reopen ? null : completedAt,
    metadata_json: {
      ...run.metadata,
      terminalReconciledAt: completedAt,
      ...(aggregate.finalStatus === 'failed' && !reopen
        ? {
            failureKind: 'quality_gate',
            lastFailureStage: 'finalizing',
          }
        : {}),
    } as Json,
  }, signal)
}

async function generateNewsletterBatch(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
  stageBudgetMs: number,
) {
  signal.throwIfAborted()
  const scopes = await listEnabledNewsletterDailyScopes(signal)
  if (scopes.length === 0) {
    throw new Error(
      'No enabled newsletter automation scope is configured. Set NEWSLETTER_AUTOMATION_OWNER_ID or NEWSLETTER_AUTOMATION_SESSION_ID.',
    )
  }

  const runIds = newsletterRunIds(run.metadata.newsletterRunIds)
  for (const { scope, settings } of scopes) {
    signal.throwIfAborted()
    const scopeKey = scope.ownerId
      ? `owner:${scope.ownerId}`
      : `session:${scope.sessionId}`
    const dailyRun = await ensureNewsletterDailyRun(scope, {
      marketDate: run.marketDate,
      targetCount: settings.targetCount,
      signal,
    })
    signal.throwIfAborted()
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
        // Rendering must yield enough wall-clock time for the immutable upload,
        // draft save, item checkpoint, and lease release to finish safely.
        chartCaptureBudgetMs: Math.max(
          1,
          Math.min(28_000, stageBudgetMs - 12_000),
        ),
        signal,
      })
      break
    }
  }

  const refreshed = await Promise.all(
    scopes.map(async ({ scope }) => {
      const scopeKey = scope.ownerId
        ? `owner:${scope.ownerId}`
        : `session:${scope.sessionId}`
      return getNewsletterDailyRun(scope, runIds[scopeKey], signal)
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

  return updateRun(run.id, leaseToken, {
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
  }, signal)
}

async function finalizeNewsletters(
  run: NewsletterDailyAutomationRun,
  leaseToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const scopes = await listEnabledNewsletterDailyScopes(signal)
  const runIds = newsletterRunIds(run.metadata.newsletterRunIds)
  const refreshed: Awaited<ReturnType<typeof getNewsletterDailyRun>>[] = []

  for (const { scope } of scopes) {
    signal.throwIfAborted()
    const scopeKey = scope.ownerId
      ? `owner:${scope.ownerId}`
      : `session:${scope.sessionId}`
    const dailyRunId = runIds[scopeKey]
    if (!dailyRunId) continue
    await finalizeNewsletterDailyItems(scope, dailyRunId, undefined, {
      signal,
    })
    refreshed.push(await getNewsletterDailyRun(scope, dailyRunId, signal))
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
    return updateRun(run.id, leaseToken, {
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
    }, signal)
  }

  const finalStatus = getDailyAutomationFinalStatus({
    selectedCount: selected,
    readyCount: ready,
    attentionCount: attention,
    failedCount: failed,
    finvizErrorCount: run.finvizErrorCount,
    summaryErrorCount: run.summaryErrorCount,
  })
  const upstreamErrors = run.finvizErrorCount + run.summaryErrorCount
  const completedAt = new Date().toISOString()
  const completed = await updateRun(run.id, leaseToken, {
    status: finalStatus,
    stage: finalStatus === 'failed' ? 'failed' : 'completed',
    newsletter_completed_scope_count: refreshed.filter(
      (dailyRun) => dailyRun.generatedCount >= dailyRun.selectedCount,
    ).length,
    newsletter_selected_count: selected,
    newsletter_generated_count: generated,
    newsletter_ready_count: ready,
    newsletter_attention_count: attention,
    newsletter_failed_count: failed,
    last_error:
      finalStatus === 'completed'
        ? null
        : finalStatus === 'failed'
          ? `Morning report produced no ready newsletter issues; ${upstreamErrors} upstream errors remain.`
          : `Morning report completed with ${upstreamErrors} upstream errors, ${attention} attention, and ${failed} failed issues.`,
    completed_at: completedAt,
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

async function notifyNewsletterMorningCompletion(
  run: NewsletterDailyAutomationRun,
  signal?: AbortSignal,
) {
  const scopes = await listEnabledNewsletterDailyScopes(signal)
  if (scopes.length === 0) {
    throw new Error('No enabled newsletter scope can receive the terminal alert.')
  }
  const runIds = newsletterRunIds(run.metadata.newsletterRunIds)
  const clean = run.status === 'completed'
  await Promise.all(
    scopes.map(async ({ scope }) => {
      const scopeKey = scope.ownerId
        ? `owner:${scope.ownerId}`
        : `session:${scope.sessionId}`
      const dailyRunId = runIds[scopeKey]
      if (!dailyRunId) {
        if (requiresApprovedDailyCandidateSetException(run.metadata)) {
          await createNewsletterNotification(scope, {
            marketDate: run.marketDate,
            type: 'morning_completed',
            severity: 'warning',
            title: 'Morning report needs an editorial exception',
            message: run.lastError ??
              'The report did not meet the configured candidate threshold. Review and approve a date-scoped candidate set before creating a draft.',
            actionUrl: '/newsletter/morning-review',
            metadata: {
              automationRunId: run.id,
              exceptionRequired: run.metadata.exceptionRequired,
              candidateCount: run.candidateCount,
              summaryGeneratedCount: run.summaryGeneratedCount,
              deliveryIntent: 'none',
            },
            dedupeKey: `morning-exception-required:${run.marketDate}`,
            signal,
          })
          return
        }
        throw new Error(`Missing newsletter run for ${scopeKey}.`)
      }
      const dailyRun = await getNewsletterDailyRun(scope, dailyRunId, signal)
      const shortlist = selectNewsletterRecommendedIssues(dailyRun.items)
      const tickers = shortlist.map((entry) => entry.ticker).join(', ')
      const upstreamErrors = run.finvizErrorCount + run.summaryErrorCount
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
          run.newsletterAttentionCount + run.newsletterFailedCount > 0
            ? `${run.newsletterAttentionCount + run.newsletterFailedCount} issues need attention.`
            : '',
          upstreamErrors > 0
            ? `${upstreamErrors} upstream source or summary errors remain.`
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
        signal,
      })
    }),
  )
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
        type: 'morning_failed',
        severity: 'error',
        title: qualityGateFailure
          ? 'Morning report did not pass its quality gate'
          : 'Morning newsletter automation stopped',
        message: qualityGateFailure
          ? (run.lastError ?? 'The report did not produce a usable issue.')
          : `${getNewsletterAutomationStageLabel(failedStage)} failed after ${MAX_STAGE_ERRORS} attempts. ${run.lastError ?? 'Review the run before retrying.'}`,
        actionUrl: '/newsletter/morning-review',
        metadata: {
          automationRunId: run.id,
          stage: failedStage,
          error: run.lastError,
        },
        dedupeKey: `morning-failed:${run.marketDate}:${failedStage}`,
        signal,
      }),
    ),
  )
}

async function recordNewsletterMorningNotificationAttempt(
  run: NewsletterDailyAutomationRun,
  succeeded: boolean,
  error: string | null,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun> {
  const supabase = getServiceClient()
  let query = supabase.rpc(
    'record_newsletter_daily_notification_attempt',
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
      `Failed to record morning notification attempt: ${
        result.error?.message ?? 'No terminal run returned'
      }`,
    )
  }
  return mapRow(row as AutomationRow)
}

export async function ensureNewsletterDailyTerminalNotification(
  run: NewsletterDailyAutomationRun,
  signal?: AbortSignal,
): Promise<NewsletterDailyAutomationRun> {
  signal?.throwIfAborted()
  if (run.notificationAppliedAt) return run
  if (!['completed', 'partial', 'failed'].includes(run.status)) return run

  try {
    if (run.status === 'failed') {
      await notifyNewsletterMorningFailure(
        run,
        retryableStage(run.metadata.lastFailureStage),
        signal,
      )
    } else {
      await notifyNewsletterMorningCompletion(run, signal)
    }
    return await recordNewsletterMorningNotificationAttempt(run, true, null, signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordNewsletterMorningNotificationAttempt(run, false, message, signal).catch(
      () => undefined,
    )
    throw new Error(`Morning terminal notification is pending: ${message}`, {
      cause: error,
    })
  }
}

export async function advanceNewsletterDailyAutomation(input: {
  marketDate?: string
  retryCompleted?: boolean
  retryFailed?: boolean
  stageBudgetMs?: number
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
          if (input.retryCompleted) {
            const reconciliation =
              await getNewsletterDailyTerminalReconciliation(current, signal)
            if (reconciliation.hasDrift) {
              current = await resetRetryNotification(
                current.id,
                leaseToken,
                signal,
              )
              current = await reconcileNewsletterDailyTerminalRun(
                current,
                leaseToken,
                reconciliation,
                signal,
              )
              if (current.status === 'running') {
                return {
                  claimed: true,
                  action: 'terminal-reconciliation-resumed',
                  run: current,
                }
              }
              try {
                current = await ensureNewsletterDailyTerminalNotification(
                  current,
                  signal,
                )
                return {
                  claimed: true,
                  action: 'terminal-reconciled',
                  run: current,
                }
              } catch {
                return {
                  claimed: true,
                  action: 'notification-pending',
                  run: current,
                }
              }
            }
          }
          try {
            current = await ensureNewsletterDailyTerminalNotification(current, signal)
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
            current = await createWiimSnapshot(current, leaseToken, signal)
            return { claimed: true, action: 'wiim-generated', run: current }
          case 'summaries':
            current = await generateSummaryBatch(current, leaseToken, signal)
            return { claimed: true, action: 'summary-batch', run: current }
          case 'newsletters':
            current = await generateNewsletterBatch(
              current,
              leaseToken,
              signal,
              stageBudgetMs,
            )
            return { claimed: true, action: 'newsletter-batch', run: current }
          case 'finalizing':
            current = await finalizeNewsletters(current, leaseToken, signal)
            try {
              current = await ensureNewsletterDailyTerminalNotification(current, signal)
              return { claimed: true, action: 'newsletters-finalized', run: current }
            } catch {
              return { claimed: true, action: 'notification-pending', run: current }
            }
          case 'completed':
            try {
              current = await ensureNewsletterDailyTerminalNotification(current, signal)
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
              last_error: null,
              completed_at: null,
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
    if (error instanceof NewsletterDailyTerminalReconciliationError) {
      throw error
    }
    const failedStage = current.stage
    const message = error instanceof Error ? error.message : String(error)
    if (isNewsletterQualityGateShortfall(failedStage, message)) {
      const completedAt = new Date().toISOString()
      current = await updateRun(current.id, leaseToken, {
        status: 'partial',
        stage: 'completed',
        last_error: message,
        completed_at: completedAt,
        metadata_json: {
          ...current.metadata,
          exceptionRequired: 'approved_daily_candidate_set',
          exceptionRecordedAt: completedAt,
          lastFailureStage: failedStage,
        } as Json,
      }, AbortSignal.timeout(5_000))
      try {
        current = await ensureNewsletterDailyTerminalNotification(
          current,
          AbortSignal.timeout(5_000),
        )
      } catch {
        // A later scheduled invocation will retry the terminal notification.
      }
      return { claimed: true, action: 'quality-gate-exception-required', run: current }
    }
    const stageErrors = stringNumberMap(current.metadata.stageErrorCounts)
    const stageErrorCount = (stageErrors[failedStage] ?? 0) + 1
    stageErrors[failedStage] = stageErrorCount
    const terminal = stageErrorCount >= MAX_STAGE_ERRORS
    const cleanupSignal = AbortSignal.timeout(5_000)
    current = await updateRun(current.id, leaseToken, {
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
    }, cleanupSignal)
    if (terminal) {
      try {
        current = await ensureNewsletterDailyTerminalNotification(
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
      marketDate,
      leaseToken,
      AbortSignal.timeout(5_000),
    ).catch(() => undefined)
  }
}

export const __testOnly = {
  aggregateNewsletterDailyTerminalState,
  isNewsletterQualityGateShortfall,
  assertMappedNewsletterDailyRuns,
  hasNewsletterDailyTerminalDrift,
  mapRow,
  stringNumberMap,
  orderFinvizRetryableSymbols,
  readFinvizCircuitState,
  isFinvizBlockingResult,
  shouldRunFinvizCanary,
  newsletterRunIds,
  requiresApprovedDailyCandidateSetException,
  retryableStage,
  loadFinvizCoverage,
  buildWhyMovedDiscoveriesFromWiim,
}
