import type {
  BeehiivIntegrationStatus,
  BeehiivLifecycleStatus,
} from '@/lib/beehiiv/types'
import {
  getBeehiivIntegrationStatus,
  listBeehiivDeliveries,
} from '@/lib/beehiiv/store'
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

export type NewsletterOperationsPipeline = 'morning' | 'mid_morning'
export type NewsletterOperationsAction = 'run_now' | 'retry_failed'

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
  morning: NewsletterOperationsPipelineRun | null
  midMorning: NewsletterOperationsPipelineRun | null
  dailyRun: NewsletterOperationsDailyRun | null
  notifications: NewsletterNotification[]
  beehiiv: {
    integration: BeehiivIntegrationStatus
    counts: Record<BeehiivLifecycleStatus, number>
    reconcileErrors: number
    staleCount: number
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
  ])

  const counts: Record<BeehiivLifecycleStatus, number> = {
    draft: 0,
    scheduled: 0,
    published: 0,
    archived: 0,
    unknown: 0,
  }
  for (const delivery of allDeliveries) {
    counts[delivery.lifecycleStatus] += 1
  }
  const staleBefore = Date.now() - 20 * 60_000
  const staleCount = allDeliveries.filter((delivery) => {
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
    generatedAt: new Date().toISOString(),
    marketDate,
    clock,
    windows: {
      morning: getNewsletterAutomationWindow(clock, [
        settings.generationHour,
      ]),
      midMorning: getMidMorningAutomationWindow(clock),
    },
    settings,
    webhookConfigured: Boolean(
      process.env.NEWSLETTER_ALERT_WEBHOOK_URL?.trim(),
    ),
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
      counts,
      reconcileErrors: allDeliveries.filter(
        (delivery) => Boolean(delivery.lastReconcileError),
      ).length,
      staleCount,
      deliveries: allDeliveries.slice(0, 20).map((delivery) => ({
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
  input: {
    pipeline: NewsletterOperationsPipeline
    action: NewsletterOperationsAction
    marketDate: string
  },
) {
  resolveOperatorScope(userId)
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
  mapMorningRun,
  mapMidMorningRun,
  retryDetails,
  resolveOperatorScope,
}
