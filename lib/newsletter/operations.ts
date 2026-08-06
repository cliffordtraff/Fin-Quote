import type {
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
  BeehiivLifecycleStatus,
} from '@/lib/beehiiv/types'
import {
  getBeehiivIntegrationStatus,
  listBeehiivDeliveries,
} from '@/lib/beehiiv/store'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { reconcileBeehiivDeliveryQueue } from './beehiiv-lifecycle'
import type { NewsletterDraftScope } from './drafts'
import {
  advanceNewsletterDailyAutomation,
  getNewsletterAutomationClock,
  getNewsletterAutomationStageLabel,
  getNewsletterAutomationWindow,
  getNewsletterDailyAutomationRun,
  listNewsletterDailyAutomationRuns,
  type NewsletterDailyAutomationRun,
} from './daily-automation'
import {
  getConfiguredNewsletterAutomationScope,
  getNewsletterDailyScopeKey,
  getLatestNewsletterDailyRun,
  getNewsletterDailySettings,
} from './daily-runs'
import type {
  NewsletterDailyItemStatus,
  NewsletterDailySettings,
  NewsletterNotification,
} from './daily-types'
import {
  advanceNewsletterMidMorningAutomation,
  getMidMorningAutomationStageLabel,
  getMidMorningAutomationWindow,
  getNewsletterMidMorningRun,
  listNewsletterMidMorningRuns,
  type NewsletterMidMorningRun,
} from './mid-morning-automation'
import { listNewsletterNotifications } from './notifications'
import { getNewsletterWebhookConfiguration } from './webhook-outbox'

export type NewsletterOperationsPipeline = 'morning' | 'mid_morning'
export type NewsletterOperationsPipelineAction = 'run_now' | 'retry_failed'
export type NewsletterOperationsAction =
  | NewsletterOperationsPipelineAction
  | 'reconcile_beehiiv'

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
  unsubscribes: number | null
  spamReports: number | null
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

function normalizeBeehiivStats(
  stats: Record<string, unknown>,
): NewsletterOperationsDeliveryStats {
  const email = isRecord(stats.email) ? stats.email : {}
  const web = isRecord(stats.web) ? stats.web : {}
  const sent = numericField(email, ['recipients', 'sent'])
  const delivered = numericField(email, ['delivered'])
  const uniqueOpens = numericField(email, ['unique_opens', 'uniqueOpens'])
  const uniqueClicks = numericField(email, ['unique_clicks', 'uniqueClicks'])
  const reportedBounces = numericField(email, [
    'bounces',
    'bounced',
    'total_bounces',
  ])

  return {
    sent,
    delivered,
    opens: numericField(email, ['opens']),
    uniqueOpens,
    openRate:
      numericField(email, ['open_rate', 'openRate']) ??
      (delivered && uniqueOpens !== null ? uniqueOpens / delivered : null),
    clicks: numericField(email, ['clicks']),
    uniqueClicks,
    clickRate:
      numericField(email, ['click_rate', 'clickRate']) ??
      (delivered && uniqueClicks !== null ? uniqueClicks / delivered : null),
    bounces:
      reportedBounces ??
      (sent !== null && delivered !== null
        ? Math.max(0, sent - delivered)
        : null),
    unsubscribes: numericField(email, ['unsubscribes']),
    spamReports: numericField(email, ['spam_reports', 'spamReports']),
    webViews: numericField(web, ['views']),
    webClicks: numericField(web, ['clicks']),
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

function easternMarketDate(value: string): string | null {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}

function draftMarketDate(draftJson: unknown, createdAt: string): string | null {
  if (isRecord(draftJson)) {
    const source = isRecord(draftJson.source) ? draftJson.source : null
    const detail = source
      ? isRecord(source.dailyBatch)
        ? source.dailyBatch
        : isRecord(source.catalyst)
          ? source.catalyst
          : null
      : null
    const sourceDate = detail?.marketDate
    if (typeof sourceDate === 'string' && validMarketDate(sourceDate)) {
      return sourceDate
    }
    if (typeof draftJson.generatedAt === 'string') {
      const generatedDate = draftJson.generatedAt.slice(0, 10)
      if (validMarketDate(generatedDate)) return generatedDate
    }
  }
  return easternMarketDate(createdAt)
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
        total: run.candidateCount,
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

function resolveOperatorScope(userId: string): NewsletterDraftScope {
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

function validMarketDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function loadDeliveryMarketDates(
  deliveries: BeehiivDeliveryRecord[],
): Promise<Map<string, string>> {
  const marketDates = new Map<string, string>()
  for (const delivery of deliveries) {
    const fallback = easternMarketDate(delivery.syncedAt)
    if (fallback) marketDates.set(delivery.draftId, fallback)
  }
  const draftIds = Array.from(
    new Set(deliveries.map((delivery) => delivery.draftId)),
  )
  if (!draftIds.length) return marketDates

  const supabase = createServiceRoleClient()
  const chunks = Array.from(
    { length: Math.ceil(draftIds.length / 100) },
    (_, index) => draftIds.slice(index * 100, index * 100 + 100),
  )
  const results = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from('newsletter_drafts')
        .select('id,draft_json,created_at')
        .in('id', ids),
    ),
  )
  for (const result of results) {
    if (result.error) continue
    for (const row of result.data ?? []) {
      const marketDate = draftMarketDate(row.draft_json, row.created_at)
      if (marketDate) marketDates.set(row.id, marketDate)
    }
  }
  return marketDates
}

async function getNewsletterWebhookOutboxHealth(
  scope: NewsletterDraftScope,
  now = new Date(),
): Promise<NewsletterOperationsWebhookHealth> {
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
    const result = await query
    if (result.error) throw result.error
    return result.count ?? 0
  }

  try {
    const [pending, delivering, delivered, errors, oldestDue, latestError] =
      await Promise.all([
        countRows({ status: 'pending' }),
        countRows({ status: 'delivering' }),
        countRows({ status: 'delivered' }),
        countRows({ withErrors: true }),
        supabase
          .from('newsletter_webhook_outbox')
          .select('next_attempt_at')
          .eq('scope_key', scopeKey)
          .is('delivered_at', null)
          .lte('next_attempt_at', now.toISOString())
          .order('next_attempt_at', { ascending: true })
          .limit(1),
        supabase
          .from('newsletter_webhook_outbox')
          .select('last_error,last_attempt_at,updated_at')
          .eq('scope_key', scopeKey)
          .not('last_error', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1),
      ])
    if (oldestDue.error) throw oldestDue.error
    if (latestError.error) throw latestError.error
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
    return {
      ...base,
      queryError: errorMessage(error),
    }
  }
}

export async function getNewsletterOperationsSnapshot(
  userId: string,
): Promise<NewsletterOperationsSnapshot> {
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
    allDeliveries,
    webhook,
  ] = await Promise.all([
    getNewsletterDailySettings(scope),
    getNewsletterDailyAutomationRun(marketDate),
    getNewsletterMidMorningRun(marketDate),
    getLatestNewsletterDailyRun(scope, marketDate),
    listNewsletterNotifications(scope, { limit: 24 }),
    listNewsletterDailyAutomationRuns(7),
    listNewsletterMidMorningRuns(7),
    scope.ownerId
      ? getBeehiivIntegrationStatus(scope.ownerId)
      : Promise.resolve(emptyIntegration()),
    scope.ownerId
      ? listBeehiivDeliveries(scope.ownerId)
      : Promise.resolve([]),
    getNewsletterWebhookOutboxHealth(scope),
  ])

  const generatedAt = new Date()
  const deliveryMarketDates = await loadDeliveryMarketDates(allDeliveries)
  const marketDateDeliveries = allDeliveries.filter(
    (delivery) => deliveryMarketDates.get(delivery.draftId) === marketDate,
  )
  const marketDateCounts = countDeliveryLifecycle(marketDateDeliveries)
  const overallCounts = countDeliveryLifecycle(allDeliveries)
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
      overallTotal: allDeliveries.length,
      reconcileErrors: marketDateDeliveries.filter(
        (delivery) => Boolean(delivery.lastReconcileError),
      ).length,
      staleCount,
      lifecycle: summarizeBeehiivLifecycle(
        marketDateDeliveries,
        generatedAt,
      ),
      stats: aggregateBeehiivStats(marketDateDeliveries),
      deliveries: marketDateDeliveries.slice(0, 20).map((delivery) => ({
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

export async function executeNewsletterOperationsAction(
  userId: string,
  input: NewsletterOperationsActionInput,
) {
  resolveOperatorScope(userId)
  if (input.action === 'reconcile_beehiiv') {
    const result: NewsletterOperationsReconciliationResult =
      await reconcileBeehiivDeliveryQueue(50, 6)
    return result
  }
  if (!validMarketDate(input.marketDate)) {
    throw new NewsletterOperationsActionError('Invalid market date.')
  }

  if (input.pipeline === 'morning') {
    const current = await getNewsletterDailyAutomationRun(input.marketDate)
    if (input.action === 'retry_failed' && current?.status !== 'failed') {
      throw new NewsletterOperationsActionError(
        'The morning pipeline is not in a failed state.',
      )
    }
    return advanceNewsletterDailyAutomation({
      marketDate: input.marketDate,
      retryFailed: input.action === 'retry_failed',
    })
  }

  const current = await getNewsletterMidMorningRun(input.marketDate)
  if (input.action === 'retry_failed' && current?.status !== 'failed') {
    throw new NewsletterOperationsActionError(
      'The mid-morning pipeline is not in a failed state.',
    )
  }
  return advanceNewsletterMidMorningAutomation({
    marketDate: input.marketDate,
    retryFailed: input.action === 'retry_failed',
  })
}

export const __testOnly = {
  aggregateBeehiivStats,
  countDeliveryLifecycle,
  draftMarketDate,
  mapMorningRun,
  mapMidMorningRun,
  normalizeBeehiivStats,
  retryDetails,
  resolveOperatorScope,
  summarizeBeehiivLifecycle,
}
