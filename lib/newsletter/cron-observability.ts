import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Database } from '@/lib/database.types'
import { getNewsletterWebhookConfiguration } from '@/lib/newsletter/webhook-outbox'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const TABLE = 'newsletter_cron_runs'
const MAX_POSTGRES_INTEGER = 2_147_483_647
const REPORTED_FAILURE_HEADER = 'x-newsletter-cron-reported-failure'

export const NEWSLETTER_CRON_JOBS = [
  'daily',
  'mid_morning',
  'beehiiv_reconciliation',
  'webhook_outbox',
] as const

export type NewsletterCronJob = (typeof NEWSLETTER_CRON_JOBS)[number]
export type NewsletterCronRunStatus = 'running' | 'succeeded' | 'failed'

type CronRunRow =
  Database['public']['Tables']['newsletter_cron_runs']['Row']

interface HeartbeatContext {
  id: string
  job: NewsletterCronJob
  startedAt: Date
  persisted: boolean
}

interface HeartbeatDependencies {
  now: () => Date
  createId: () => string
}

const defaultDependencies: HeartbeatDependencies = {
  now: () => new Date(),
  createId: randomUUID,
}

function reportPersistenceFailure(
  job: NewsletterCronJob,
  phase: 'start' | 'complete',
): void {
  if (process.env.NODE_ENV === 'test') return
  console.error('[newsletter-cron-heartbeat] persistence failure', {
    job,
    phase,
  })
}

async function startHeartbeat(
  job: NewsletterCronJob,
  dependencies: HeartbeatDependencies,
): Promise<HeartbeatContext> {
  const context: HeartbeatContext = {
    id: dependencies.createId(),
    job,
    startedAt: dependencies.now(),
    persisted: false,
  }
  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from(TABLE).insert({
      id: context.id,
      job_name: context.job,
      status: 'running',
      started_at: context.startedAt.toISOString(),
    })
    if (error) throw error
    context.persisted = true
  } catch {
    reportPersistenceFailure(job, 'start')
  }
  return context
}

async function completeHeartbeat(
  context: HeartbeatContext,
  input: {
    status: Extract<NewsletterCronRunStatus, 'succeeded' | 'failed'>
    errorCode:
      | 'http_4xx'
      | 'http_5xx'
      | 'reported_failure'
      | 'unhandled_exception'
      | null
  },
  dependencies: HeartbeatDependencies,
): Promise<void> {
  if (!context.persisted) return
  const completedAt = dependencies.now()
  const durationMs = Math.min(
    MAX_POSTGRES_INTEGER,
    Math.max(0, completedAt.getTime() - context.startedAt.getTime()),
  )
  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from(TABLE)
      .update({
        status: input.status,
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        error_code: input.errorCode,
      })
      .eq('id', context.id)
      .eq('status', 'running')
    if (error) throw error
  } catch {
    reportPersistenceFailure(context.job, 'complete')
  }
}

/**
 * Records one authorized cron invocation without making observability a new
 * failure mode for the underlying newsletter work.
 */
export async function withNewsletterCronHeartbeat<T extends Response>(
  job: NewsletterCronJob,
  operation: () => Promise<T>,
  dependencies: HeartbeatDependencies = defaultDependencies,
): Promise<T> {
  const context = await startHeartbeat(job, dependencies)
  try {
    const response = await operation()
    const reportedFailure = response.headers.has(REPORTED_FAILURE_HEADER)
    if (reportedFailure) response.headers.delete(REPORTED_FAILURE_HEADER)
    const failed = response.status >= 400 || reportedFailure
    await completeHeartbeat(
      context,
      {
        status: failed ? 'failed' : 'succeeded',
        errorCode: failed
          ? reportedFailure
            ? 'reported_failure'
            : response.status >= 500
              ? 'http_5xx'
              : 'http_4xx'
          : null,
      },
      dependencies,
    )
    return response
  } catch (error) {
    await completeHeartbeat(
      context,
      { status: 'failed', errorCode: 'unhandled_exception' },
      dependencies,
    )
    throw error
  }
}

/** Marks a successful HTTP response whose durable job state is failed. */
export function markNewsletterCronResponseFailed<T extends Response>(
  response: T,
): T {
  response.headers.set(REPORTED_FAILURE_HEADER, '1')
  return response
}

const JOB_LABELS: Record<NewsletterCronJob, string> = {
  daily: 'Daily newsletter',
  mid_morning: 'Mid-morning newsletter',
  beehiiv_reconciliation: 'Beehiiv reconciliation',
  webhook_outbox: 'Webhook outbox',
}

const STALE_AFTER_MS: Record<NewsletterCronJob, number> = {
  daily: 10 * 60_000,
  mid_morning: 10 * 60_000,
  beehiiv_reconciliation: 10 * 60_000,
  webhook_outbox: 15 * 60_000,
}

// These mirror the pg_cron schedules. At the first tick of a window, give the
// invocation one complete cron period to persist its heartbeat before alerting.
const CRON_PERIOD_MS: Record<NewsletterCronJob, number> = {
  daily: 2 * 60_000,
  mid_morning: 2 * 60_000,
  beehiiv_reconciliation: 60_000,
  webhook_outbox: 5 * 60_000,
}

const WINDOW_START_HOUR_UTC: Partial<Record<NewsletterCronJob, number>> = {
  daily: 8,
  mid_morning: 14,
  beehiiv_reconciliation: 12,
}

export type NewsletterCronJobHealthState =
  | 'healthy'
  | 'idle'
  | 'disabled'
  | 'running'
  | 'stale'
  | 'failed'

export type NewsletterCronOperatorWarningCode =
  | 'webhook_not_configured'
  | 'webhook_configuration_invalid'

export interface NewsletterCronOperatorWarning {
  code: NewsletterCronOperatorWarningCode
  job: Extract<NewsletterCronJob, 'webhook_outbox'>
  message: string
}

export interface NewsletterCronHealthOptions {
  webhookOutboxEnabled?: boolean
  webhookOutboxWarning?: NewsletterCronOperatorWarningCode | null
  /**
   * Job names with at least one old, unfinished heartbeat. This is kept as a
   * job-level signal so the public health response never exposes raw run data.
   */
  staleRunningJobs?: ReadonlySet<NewsletterCronJob>
}

export interface NewsletterCronJobHealth {
  job: NewsletterCronJob
  label: string
  state: NewsletterCronJobHealthState
  enabled: boolean
  expectedNow: boolean
  lastStatus: NewsletterCronRunStatus | null
  lastStartedAt: string | null
  lastCompletedAt: string | null
  ageSeconds: number | null
}

export interface NewsletterCronHealthSnapshot {
  status: 'healthy' | 'unhealthy'
  checkedAt: string
  warnings: NewsletterCronOperatorWarning[]
  jobs: NewsletterCronJobHealth[]
}

const WARNING_MESSAGES: Record<NewsletterCronOperatorWarningCode, string> = {
  webhook_not_configured:
    'Optional newsletter webhook delivery is disabled because its configuration is incomplete.',
  webhook_configuration_invalid:
    'Optional newsletter webhook delivery is disabled because its configuration is invalid.',
}

function isWeekdayUtc(now: Date): boolean {
  const day = now.getUTCDay()
  return day >= 1 && day <= 5
}

function isJobExpectedNow(job: NewsletterCronJob, now: Date): boolean {
  if (job === 'webhook_outbox') return true
  if (!isWeekdayUtc(now)) return false
  const hour = now.getUTCHours()
  const inWindow =
    job === 'daily'
      ? hour >= 8 && hour <= 17
      : job === 'mid_morning'
        ? hour >= 14 && hour <= 17
        : hour >= 12 && hour <= 23
  if (!inWindow) return false

  const windowStartHour = WINDOW_START_HOUR_UTC[job]
  if (hour !== windowStartHour) return true

  const windowStartedAt = new Date(now)
  windowStartedAt.setUTCMinutes(0, 0, 0)
  return now.getTime() - windowStartedAt.getTime() >= CRON_PERIOD_MS[job]
}

function normalizedStatus(value: string): NewsletterCronRunStatus | null {
  return value === 'running' || value === 'succeeded' || value === 'failed'
    ? value
    : null
}

export function evaluateNewsletterCronHealth(
  rows: Partial<Record<NewsletterCronJob, Pick<
    CronRunRow,
    'job_name' | 'status' | 'started_at' | 'completed_at'
  >>>,
  now = new Date(),
  options: NewsletterCronHealthOptions = {},
): NewsletterCronHealthSnapshot {
  const webhookOutboxEnabled = options.webhookOutboxEnabled ?? true
  const webhookOutboxWarning = webhookOutboxEnabled
    ? null
    : (options.webhookOutboxWarning ?? 'webhook_not_configured')
  const warnings: NewsletterCronOperatorWarning[] = webhookOutboxWarning
    ? [
        {
          code: webhookOutboxWarning,
          job: 'webhook_outbox',
          message: WARNING_MESSAGES[webhookOutboxWarning],
        },
      ]
    : []
  const jobs = NEWSLETTER_CRON_JOBS.map((job): NewsletterCronJobHealth => {
    const row = rows[job]
    const enabled = job !== 'webhook_outbox' || webhookOutboxEnabled
    const expectedNow = enabled && isJobExpectedNow(job, now)
    const hasStaleRunningHeartbeat = options.staleRunningJobs?.has(job) ?? false
    const lastStatus = row ? normalizedStatus(row.status) : null
    const startedAt = row ? new Date(row.started_at) : null
    const validStartedAt =
      startedAt && Number.isFinite(startedAt.getTime()) ? startedAt : null
    const ageMs = validStartedAt
      ? Math.max(0, now.getTime() - validStartedAt.getTime())
      : null
    let state: NewsletterCronJobHealthState = enabled
      ? expectedNow
        ? 'stale'
        : 'idle'
      : 'disabled'

    if (!enabled) {
      state = 'disabled'
    } else if (hasStaleRunningHeartbeat) {
      state = 'stale'
    } else if (row && lastStatus === 'failed') {
      state = 'failed'
    } else if (row && lastStatus === 'running') {
      state = ageMs !== null && ageMs <= STALE_AFTER_MS[job]
        ? 'running'
        : 'stale'
    } else if (expectedNow) {
      state =
        row &&
        lastStatus === 'succeeded' &&
        ageMs !== null &&
        ageMs <= STALE_AFTER_MS[job]
          ? 'healthy'
          : 'stale'
    }

    return {
      job,
      label: JOB_LABELS[job],
      state,
      enabled,
      expectedNow,
      lastStatus,
      lastStartedAt: validStartedAt?.toISOString() ?? null,
      lastCompletedAt:
        row?.completed_at &&
        Number.isFinite(new Date(row.completed_at).getTime())
          ? new Date(row.completed_at).toISOString()
          : null,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    }
  })
  return {
    status: jobs.some((job) => job.state === 'stale' || job.state === 'failed')
      ? 'unhealthy'
      : 'healthy',
    checkedAt: now.toISOString(),
    warnings,
    jobs,
  }
}

export async function getNewsletterCronHealthSnapshot(
  now = new Date(),
): Promise<NewsletterCronHealthSnapshot> {
  const webhookConfiguration = getNewsletterWebhookConfiguration()
  const supabase = createServiceRoleClient()
  const [results, staleRunningResult] = await Promise.all([
    Promise.all(
      NEWSLETTER_CRON_JOBS.map(async (job) => {
        const { data, error } = await supabase
          .from(TABLE)
          .select('job_name,status,started_at,completed_at')
          .eq('job_name', job)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw new Error('Newsletter cron health query failed.')
        return [job, data] as const
      }),
    ),
    supabase
      .from(TABLE)
      .select('job_name,started_at')
      .in('job_name', NEWSLETTER_CRON_JOBS)
      .eq('status', 'running'),
  ])
  if (staleRunningResult.error) {
    throw new Error('Newsletter cron health query failed.')
  }
  const staleRunningJobs = new Set<NewsletterCronJob>()
  for (const row of staleRunningResult.data ?? []) {
    const job = row.job_name as NewsletterCronJob
    const startedAt = new Date(row.started_at)
    if (
      NEWSLETTER_CRON_JOBS.includes(job) &&
      Number.isFinite(startedAt.getTime()) &&
      now.getTime() - startedAt.getTime() > STALE_AFTER_MS[job]
    ) {
      staleRunningJobs.add(job)
    }
  }
  return evaluateNewsletterCronHealth(
    Object.fromEntries(
      results.filter((entry): entry is [NewsletterCronJob, NonNullable<typeof entry[1]>] =>
        Boolean(entry[1]),
      ),
    ),
    now,
    {
      webhookOutboxEnabled: webhookConfiguration.configured,
      webhookOutboxWarning: webhookConfiguration.configured
        ? null
        : webhookConfiguration.error
          ? 'webhook_configuration_invalid'
          : 'webhook_not_configured',
      staleRunningJobs,
    },
  )
}

export const __testOnly = {
  isJobExpectedNow,
  CRON_PERIOD_MS,
  STALE_AFTER_MS,
}
