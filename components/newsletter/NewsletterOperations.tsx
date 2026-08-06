'use client'

import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  Circle,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ServerCog,
  TriangleAlert,
  Webhook,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type {
  NewsletterOperationsPipeline,
  NewsletterOperationsPipelineAction,
  NewsletterOperationsPipelineRun,
  NewsletterOperationsReconciliationResult,
  NewsletterOperationsSnapshot,
} from '@/lib/newsletter/operations'

interface ErrorResponse {
  error?: string
}

interface ReconciliationResponse extends ErrorResponse {
  result?: NewsletterOperationsReconciliationResult
}

function isOperationsSnapshot(
  value: NewsletterOperationsSnapshot | ErrorResponse,
): value is NewsletterOperationsSnapshot {
  return 'marketDate' in value && 'beehiiv' in value
}

const MORNING_STAGES = [
  ['collecting', 'Source'],
  ['finviz', 'Finviz'],
  ['wiim', 'WIIM'],
  ['summaries', 'Summary'],
  ['newsletters', 'Issues'],
  ['finalizing', 'Quality'],
  ['completed', 'Ready'],
] as const

const MID_MORNING_STAGES = [
  ['collecting', 'Movers'],
  ['finviz', 'Finviz'],
  ['wiim', 'WIIM'],
  ['summaries', 'Summary'],
  ['finalizing', 'Delta'],
  ['completed', 'Ready'],
] as const

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(parsed)
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return 'Not started'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 'N/A'
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function formatElapsed(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not available'
  const seconds = Math.max(0, Math.round(value / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatMetric(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}

function formatRate(value: number | null): string {
  if (value === null) return '—'
  const normalized = Math.abs(value) <= 1 ? value * 100 : value
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(normalized)}%`
}

function displayStatus(status: string | undefined): string {
  if (!status) return 'Not started'
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusClass(status: string | undefined): string {
  if (status === 'completed' || status === 'published') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
  }
  if (status === 'partial' || status === 'scheduled') {
    return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
  }
  if (status === 'failed' || status === 'unknown') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
  }
  if (status === 'running' || status === 'generating') {
    return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300'
  }
  return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300'
}

function isTerminal(run: NewsletterOperationsPipelineRun | null) {
  return run?.status === 'completed' || run?.status === 'partial'
}

function StatusPill({ status }: { status: string | undefined }) {
  return (
    <span
      className={`inline-flex shrink-0 border px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(status)}`}
    >
      {displayStatus(status)}
    </span>
  )
}

function PipelineProgress({
  pipeline,
  run,
}: {
  pipeline: NewsletterOperationsPipeline
  run: NewsletterOperationsPipelineRun | null
}) {
  const stages =
    pipeline === 'morning' ? MORNING_STAGES : MID_MORNING_STAGES
  const terminal = isTerminal(run)
  const visibleStage =
    run?.status === 'failed' && run.retryStage ? run.retryStage : run?.stage
  const foundIndex = stages.findIndex(([id]) => id === visibleStage)
  const currentIndex = terminal
    ? stages.length - 1
    : Math.max(0, foundIndex)

  return (
    <ol
      aria-label={`${pipeline === 'morning' ? 'Morning' : 'Mid-morning'} pipeline progress`}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
      }}
    >
      {stages.map(([id, label], index) => {
        const complete = terminal || index < currentIndex
        const active = Boolean(run) && !terminal && index === currentIndex
        return (
          <li key={id} className="min-w-0 text-center">
            <div className="flex items-center">
              <span
                className={`h-px flex-1 ${
                  index > 0 && (complete || active)
                    ? 'bg-sage-500'
                    : 'bg-gray-200 first:bg-transparent dark:bg-gray-800'
                }`}
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  complete
                    ? 'bg-sage-700 text-white'
                    : active
                      ? 'border-2 border-sage-600 bg-white text-sage-700 dark:bg-gray-950'
                      : 'border border-gray-300 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-950'
                }`}
              >
                {complete ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : (
                  <Circle className="h-2 w-2 fill-current" aria-hidden />
                )}
              </span>
              <span
                className={`h-px flex-1 ${
                  index < stages.length - 1 && complete
                    ? 'bg-sage-500'
                    : 'bg-gray-200 last:bg-transparent dark:bg-gray-800'
                }`}
              />
            </div>
            <span
              className={`mt-1 block truncate text-[9px] font-semibold sm:text-[10px] ${
                complete || active
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
              title={label}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function PipelinePanel({
  pipeline,
  run,
  busy,
  onAction,
}: {
  pipeline: NewsletterOperationsPipeline
  run: NewsletterOperationsPipelineRun | null
  busy: boolean
  onAction: (
    pipeline: NewsletterOperationsPipeline,
    action: NewsletterOperationsPipelineAction,
  ) => void
}) {
  const title = pipeline === 'morning' ? 'Morning' : 'Mid-morning'
  const failed = run?.status === 'failed'

  return (
    <section className="min-w-0 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
            {title}
          </h2>
          <p className="truncate text-xs text-gray-500">
            {run?.stageLabel ?? 'Waiting for first invocation'}
          </p>
        </div>
        <div className="ml-auto">
          <StatusPill status={run?.status} />
        </div>
        {!isTerminal(run) ? (
          <button
            type="button"
            onClick={() =>
              onAction(pipeline, failed ? 'retry_failed' : 'run_now')
            }
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-gray-950 px-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            title={
              failed
                ? `Retry ${run?.retryStage ?? 'failed stage'}`
                : `Run ${title.toLowerCase()} pipeline now`
            }
          >
            {busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : failed ? (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
            {failed ? 'Retry stage' : 'Run now'}
          </button>
        ) : null}
      </div>

      <div className="p-4">
        <PipelineProgress pipeline={pipeline} run={run} />

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[460px] table-fixed text-left text-xs">
            <thead className="border-y border-gray-100 text-[10px] uppercase text-gray-500 dark:border-gray-800">
              <tr>
                <th className="w-[40%] py-2 font-semibold">Output</th>
                <th className="py-2 text-right font-semibold">Processed</th>
                <th className="py-2 text-right font-semibold">Clean</th>
                <th className="py-2 text-right font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(run?.metrics ?? []).map((metric) => (
                <tr key={metric.id}>
                  <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">
                    {metric.label}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                    {metric.completed}/{metric.total}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {metric.successful}
                  </td>
                  <td
                    className={`py-2.5 text-right font-semibold tabular-nums ${
                      metric.errors
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {metric.errors}
                  </td>
                </tr>
              ))}
              {!run ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-gray-500">
                    No run for this market date
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 text-xs dark:border-gray-800 sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Started</dt>
            <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
              {formatDateTime(run?.startedAt ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Duration</dt>
            <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
              {formatDuration(run?.startedAt ?? null, run?.completedAt ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Invocations</dt>
            <dd className="mt-1 font-medium tabular-nums text-gray-800 dark:text-gray-200">
              {run?.invocationCount ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Heartbeat</dt>
            <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
              {formatDateTime(run?.lastHeartbeatAt ?? null)}
            </dd>
          </div>
        </dl>

        {run?.lastError ? (
          <div className="mt-4 flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2.5 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">
                {run.retryStage
                  ? `${displayStatus(run.retryStage)} failed`
                  : 'Pipeline error'}
              </p>
              <p className="mt-0.5 break-words leading-5">{run.lastError}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function SummaryCell({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  tone: 'neutral' | 'good' | 'warning' | 'bad'
}) {
  const color = {
    neutral: 'text-gray-800 dark:text-gray-200',
    good: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    bad: 'text-red-700 dark:text-red-400',
  }[tone]
  return (
    <div className="min-w-0 border-b border-r border-gray-100 px-4 py-3 last:border-r-0 dark:border-gray-800 [&:nth-child(n+3)]:border-b-0 lg:border-b-0">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-gray-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className={`mt-1 truncate text-base font-semibold ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-gray-500" title={detail}>
        {detail}
      </p>
    </div>
  )
}

function ProviderHealth({
  snapshot,
}: {
  snapshot: NewsletterOperationsSnapshot
}) {
  const rows = [
    ...(snapshot.morning?.metrics.map((metric) => ({
      pipeline: 'Morning',
      ...metric,
    })) ?? []),
    ...(snapshot.midMorning?.metrics.map((metric) => ({
      pipeline: 'Mid-morning',
      ...metric,
    })) ?? []),
  ]
  return (
    <section className="mt-5 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <ServerCog className="h-4 w-4 text-gray-500" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Provider and generation health
        </h2>
        <span className="ml-auto text-[11px] text-gray-500">
          Target {snapshot.settings.targetCount}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 dark:bg-gray-950/50">
            <tr>
              <th className="px-4 py-2 font-semibold">Pipeline</th>
              <th className="px-4 py-2 font-semibold">Output</th>
              <th className="px-4 py-2 text-right font-semibold">Processed</th>
              <th className="px-4 py-2 text-right font-semibold">Clean</th>
              <th className="px-4 py-2 text-right font-semibold">Errors</th>
              <th className="px-4 py-2 text-right font-semibold">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row) => (
              <tr key={`${row.pipeline}:${row.id}`}>
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                  {row.pipeline}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.completed}/{row.total}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {row.successful}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    row.errors
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {row.errors}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.errors ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Review
                    </span>
                  ) : row.total && row.completed >= row.total ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Complete
                    </span>
                  ) : (
                    <span className="text-gray-500">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DeliverySection({
  snapshot,
  busy,
  onReconcile,
}: {
  snapshot: NewsletterOperationsSnapshot
  busy: boolean
  onReconcile: () => void
}) {
  const marketDateTotal = Object.values(
    snapshot.beehiiv.marketDateCounts,
  ).reduce((total, count) => total + count, 0)
  const stats = snapshot.beehiiv.stats
  const performance = [
    {
      label: 'Sent',
      value: formatMetric(stats.sent),
      detail: 'Email recipients',
    },
    {
      label: 'Delivered',
      value: formatMetric(stats.delivered),
      detail:
        stats.sent === null
          ? 'Accepted by inboxes'
          : `${formatMetric(stats.bounces)} bounced`,
    },
    {
      label: 'Unique opens',
      value: formatMetric(stats.uniqueOpens),
      detail: `${formatRate(stats.openRate)} · ${formatMetric(stats.opens)} total`,
    },
    {
      label: 'Unique clicks',
      value: formatMetric(stats.uniqueClicks),
      detail: `${formatRate(stats.clickRate)} · ${formatMetric(stats.clicks)} total`,
    },
    {
      label: 'Bounces',
      value: formatMetric(stats.bounces),
      detail: `${formatRate(stats.bounceRate)} · ${formatMetric(stats.hardBounces)} hard / ${formatMetric(stats.softBounces)} soft`,
    },
    {
      label: 'Unsubscribes',
      value: formatMetric(stats.unsubscribes),
      detail: `${formatRate(stats.unsubscribeRate)} · guardrail 0.30%`,
    },
    {
      label: 'Spam reports',
      value: formatMetric(stats.spamReports),
      detail: `${formatRate(stats.spamReportRate)} · guardrail 0.10%`,
    },
    {
      label: 'Web',
      value:
        stats.webViews === null
          ? '—'
          : `${formatMetric(stats.webViews)} views`,
      detail: `${formatMetric(stats.webClicks)} clicks`,
    },
  ]

  return (
    <section className="min-w-0 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <MailCheck className="h-4 w-4 text-gray-500" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Beehiiv delivery
        </h2>
        <span className="text-[11px] text-gray-500">
          {marketDateTotal} this market date · {snapshot.beehiiv.overallTotal}{' '}
          overall
        </span>
        <button
          type="button"
          onClick={onReconcile}
          disabled={busy || !snapshot.beehiiv.integration.connected}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800"
          title="Refresh lifecycle state and Beehiiv delivery statistics"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
            aria-hidden
          />
          Reconcile now
        </button>
      </div>
      <div className="grid grid-cols-5 border-b border-gray-100 dark:border-gray-800">
        {(['draft', 'scheduled', 'published', 'archived', 'unknown'] as const).map(
          (status) => (
            <div
              key={status}
              className="min-w-0 border-r border-gray-100 px-2 py-3 text-center last:border-r-0 dark:border-gray-800"
            >
              <p className="text-lg font-semibold tabular-nums text-gray-950 dark:text-white">
                {snapshot.beehiiv.marketDateCounts[status]}
              </p>
              <p className="truncate text-[9px] font-semibold uppercase text-gray-500 sm:text-[10px]">
                {status === 'scheduled' ? 'Sched.' : status}
              </p>
              <p className="mt-0.5 truncate text-[9px] tabular-nums text-gray-400">
                {snapshot.beehiiv.overallCounts[status]} overall
              </p>
            </div>
          ),
        )}
      </div>
      <dl className="grid grid-cols-2 border-b border-gray-100 text-xs dark:border-gray-800 lg:grid-cols-4">
        <div className="border-b border-r border-gray-100 px-4 py-3 dark:border-gray-800 lg:border-b-0">
          <dt className="text-gray-500">Last remote check</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
            {formatDateTime(snapshot.beehiiv.lifecycle.latestReconciledAt)}
          </dd>
        </div>
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800 lg:border-b-0 lg:border-r">
          <dt className="text-gray-500">Reconcile freshness</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
            {formatElapsed(snapshot.beehiiv.lifecycle.freshnessMs)}
          </dd>
        </div>
        <div className="border-r border-gray-100 px-4 py-3 dark:border-gray-800">
          <dt className="text-gray-500">Oldest active check</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
            {formatDateTime(snapshot.beehiiv.lifecycle.oldestActiveCheckAt)}
          </dd>
          <dd className="mt-0.5 text-[10px] text-gray-500">
            {snapshot.beehiiv.staleCount} stale beyond 20m
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-gray-500">Average time to publish</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
            {formatElapsed(snapshot.beehiiv.lifecycle.averagePublishLatencyMs)}
          </dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-800 sm:grid-cols-4 xl:grid-cols-8">
        {performance.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 border-b border-r border-gray-100 px-3 py-3 dark:border-gray-800 xl:border-b-0"
          >
            <p className="truncate text-[9px] font-semibold uppercase text-gray-500">
              {metric.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-950 dark:text-white">
              {metric.value}
            </p>
            <p
              className="mt-0.5 truncate text-[10px] text-gray-500"
              title={metric.detail}
            >
              {metric.detail}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 dark:bg-gray-950/50">
            <tr>
              <th className="px-4 py-2 font-semibold">Issue</th>
              <th className="px-4 py-2 font-semibold">Lifecycle</th>
              <th className="px-4 py-2 font-semibold">Reconciled</th>
              <th className="px-4 py-2 text-right font-semibold">
                Delivered / sent
              </th>
              <th className="px-4 py-2 text-right font-semibold">Opens</th>
              <th className="px-4 py-2 text-right font-semibold">Click</th>
              <th className="px-4 py-2 font-semibold">Health</th>
              <th className="px-4 py-2 text-right font-semibold">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {snapshot.beehiiv.deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td className="max-w-[280px] truncate px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                  {delivery.title}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={delivery.lifecycleStatus} />
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {formatDateTime(delivery.lastReconciledAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {formatMetric(delivery.stats.delivered)} /{' '}
                  {formatMetric(delivery.stats.sent)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {formatMetric(delivery.stats.uniqueOpens)}{' '}
                  <span className="text-[10px] text-gray-400">
                    {formatRate(delivery.stats.openRate)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {formatMetric(delivery.stats.uniqueClicks)}{' '}
                  <span className="text-[10px] text-gray-400">
                    {formatRate(delivery.stats.clickRate)}
                  </span>
                </td>
                <td className="max-w-[200px] px-4 py-3">
                  {delivery.lastReconcileError ? (
                    <span
                      className="block truncate text-red-700 dark:text-red-400"
                      title={delivery.lastReconcileError}
                    >
                      {delivery.lastReconcileError}
                    </span>
                  ) : delivery.statsLastError ? (
                    <span
                      className="block truncate text-amber-700 dark:text-amber-400"
                      title={delivery.statsLastError}
                    >
                      Analytics stale: {delivery.statsLastError}
                    </span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Synced
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={delivery.editorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-label={`Open ${delivery.title} in Beehiiv`}
                    title="Open in Beehiiv"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </td>
              </tr>
            ))}
            {snapshot.beehiiv.deliveries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No Beehiiv deliveries for this market date
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WebhookHealthSection({
  snapshot,
}: {
  snapshot: NewsletterOperationsSnapshot
}) {
  const webhook = snapshot.webhook
  const unhealthy = Boolean(webhook.queryError || webhook.errors)
  const status = !webhook.configured
    ? 'not configured'
    : unhealthy
      ? 'failed'
      : webhook.pending || webhook.delivering
        ? 'running'
        : 'completed'
  const configurationDetail = webhook.configurationError
    ? webhook.configurationError
    : webhook.missing.length
      ? `Missing ${webhook.missing.join(' and ')}`
      : null

  return (
    <section className="min-w-0 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <Webhook className="h-4 w-4 text-gray-500" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Webhook outbox
        </h2>
        <div className="ml-auto">
          <StatusPill status={status} />
        </div>
      </div>
      <div className="grid grid-cols-4 border-b border-gray-100 dark:border-gray-800">
        {[
          ['Pending', webhook.pending],
          ['Delivering', webhook.delivering],
          ['Delivered', webhook.delivered],
          ['Errors', webhook.errors],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 border-r border-gray-100 px-2 py-3 text-center last:border-r-0 dark:border-gray-800"
          >
            <p className="text-lg font-semibold tabular-nums text-gray-950 dark:text-white">
              {value}
            </p>
            <p className="truncate text-[9px] font-semibold uppercase text-gray-500">
              {label}
            </p>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 text-xs">
        <div className="border-r border-gray-100 px-4 py-3 dark:border-gray-800">
          <dt className="text-gray-500">Oldest due</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-gray-200">
            {webhook.oldestDueAt
              ? formatDateTime(webhook.oldestDueAt)
              : 'No overdue events'}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-gray-500">Last delivery error</dt>
          <dd
            className={`mt-1 truncate font-medium ${
              webhook.lastError
                ? 'text-red-700 dark:text-red-400'
                : 'text-gray-800 dark:text-gray-200'
            }`}
            title={webhook.lastError ?? undefined}
          >
            {webhook.lastError ?? 'None'}
          </dd>
          {webhook.lastErrorAt ? (
            <dd className="mt-0.5 text-[10px] text-gray-500">
              {formatDateTime(webhook.lastErrorAt)}
            </dd>
          ) : null}
        </div>
      </dl>
      {configurationDetail || webhook.queryError ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {webhook.queryError
            ? `Outbox health unavailable: ${webhook.queryError}`
            : configurationDetail}
        </div>
      ) : null}
    </section>
  )
}

function NotificationSection({
  snapshot,
  busy,
  onMarkAllRead,
}: {
  snapshot: NewsletterOperationsSnapshot
  busy: boolean
  onMarkAllRead: () => void
}) {
  const unread = snapshot.notifications.filter(
    (notification) => !notification.readAt,
  ).length
  return (
    <section className="min-w-0 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <Bell className="h-4 w-4 text-gray-500" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Notifications
        </h2>
        <span className="ml-auto text-xs font-semibold text-gray-500">
          {unread} unread
        </span>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!unread || busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Mark all notifications read"
          title="Mark all read"
        >
          {busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
      <div className="max-h-[470px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
        {snapshot.notifications.map((notification) => (
          <div
            key={notification.id}
            className={`px-4 py-3 ${
              notification.readAt
                ? ''
                : 'bg-sage-50/50 dark:bg-sage-950/10'
            }`}
          >
            <div className="flex items-start gap-2">
              {notification.severity === 'error' ? (
                <XCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                  aria-hidden
                />
              ) : notification.severity === 'warning' ? (
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                  aria-hidden
                />
              ) : (
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {notification.title}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-600 dark:text-gray-400">
                  {notification.message}
                </p>
                <p className="mt-1.5 text-[10px] text-gray-500">
                  {formatDateTime(notification.createdAt)}
                  {notification.deliveredAt ? ' / webhook sent' : ''}
                </p>
              </div>
            </div>
          </div>
        ))}
        {!snapshot.notifications.length ? (
          <p className="px-4 py-8 text-center text-xs text-gray-500">
            No notifications
          </p>
        ) : null}
      </div>
    </section>
  )
}

function RecentRuns({
  snapshot,
}: {
  snapshot: NewsletterOperationsSnapshot
}) {
  return (
    <section className="mt-5 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <Clock3 className="h-4 w-4 text-gray-500" aria-hidden />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Recent runs
        </h2>
        <span className="ml-auto text-[11px] text-gray-500">
          Updated {formatDateTime(snapshot.generatedAt)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 dark:bg-gray-950/50">
            <tr>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Pipeline</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Stage</th>
              <th className="px-4 py-2 text-right font-semibold">Duration</th>
              <th className="px-4 py-2 text-right font-semibold">Invocations</th>
              <th className="px-4 py-2 text-right font-semibold">Failures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {snapshot.history.map((run) => (
              <tr key={`${run.pipeline}:${run.id}`}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                  {run.marketDate}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {run.pipeline === 'morning' ? 'Morning' : 'Mid-morning'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={run.status} />
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {run.stageLabel}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatDuration(run.startedAt, run.completedAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {run.invocationCount}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    run.stageFailureCount
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {run.stageFailureCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function NewsletterOperations() {
  const [snapshot, setSnapshot] =
    useState<NewsletterOperationsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch('/api/newsletter/operations', {
        cache: 'no-store',
      })
      if (response.status === 401) {
        setAuthRequired(true)
        setSnapshot(null)
        return
      }
      const body = (await response.json()) as
        | NewsletterOperationsSnapshot
        | ErrorResponse
      if (!response.ok || !isOperationsSnapshot(body)) {
        throw new Error(
          'error' in body && body.error
            ? body.error
            : 'Failed to load newsletter operations.',
        )
      }
      setSnapshot(body)
      setAuthRequired(false)
      setError(null)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load newsletter operations.',
      )
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [load])

  const runAction = useCallback(
    async (
      pipeline: NewsletterOperationsPipeline,
      action: NewsletterOperationsPipelineAction,
    ) => {
      if (!snapshot) return
      setBusyKey(`${pipeline}:${action}`)
      setNotice(null)
      setError(null)
      try {
        const response = await fetch('/api/newsletter/operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline,
            action,
            marketDate: snapshot.marketDate,
          }),
        })
        const body = (await response.json()) as ErrorResponse
        if (!response.ok) {
          throw new Error(body.error ?? 'Newsletter operation failed.')
        }
        const label = pipeline === 'morning' ? 'Morning' : 'Mid-morning'
        setNotice(
          action === 'retry_failed'
            ? `${label} retry resumed.`
            : `${label} pipeline advanced.`,
        )
        await load(true)
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'Newsletter operation failed.',
        )
      } finally {
        setBusyKey(null)
      }
    },
    [load, snapshot],
  )

  const reconcileBeehiiv = useCallback(async () => {
    setBusyKey('beehiiv:reconcile')
    setNotice(null)
    setError(null)
    try {
      const response = await fetch('/api/newsletter/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconcile_beehiiv' }),
      })
      const body = (await response.json()) as ReconciliationResponse
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? 'Beehiiv reconciliation failed.')
      }
      const { attempted, updated, failed } = body.result
      const report = `${attempted} attempted, ${updated} updated, ${failed.length} failed.`
      if (failed.length) {
        setError(`${report} ${failed[0].error}`)
      } else {
        setNotice(`Beehiiv reconciliation complete: ${report}`)
      }
      await load(true)
    } catch (reconcileError) {
      setError(
        reconcileError instanceof Error
          ? reconcileError.message
          : 'Beehiiv reconciliation failed.',
      )
    } finally {
      setBusyKey(null)
    }
  }, [load])

  const markAllRead = useCallback(async () => {
    if (!snapshot) return
    const ids = snapshot.notifications
      .filter((notification) => !notification.readAt)
      .map((notification) => notification.id)
    if (!ids.length) return
    setBusyKey('notifications')
    try {
      const response = await fetch('/api/newsletter/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) throw new Error('Failed to update notifications.')
      await load(true)
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : 'Failed to update notifications.',
      )
    } finally {
      setBusyKey(null)
    }
  }, [load, snapshot])

  const unreadCount =
    snapshot?.notifications.filter((notification) => !notification.readAt)
      .length ?? 0

  if (loading && !snapshot) {
    return (
      <div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-8 w-64 animate-pulse bg-gray-200 dark:bg-gray-800" />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="h-80 animate-pulse border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
          <div className="h-80 animate-pulse border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
        </div>
      </div>
    )
  }

  if (authRequired) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12">
        <section className="w-full border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <LockKeyhole className="mx-auto h-7 w-7 text-gray-500" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-gray-950 dark:text-white">
            Newsletter Operations
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Operator access required
          </p>
          <Link
            href="/auth?redirect=/newsletter/operations"
            className="mt-6 inline-flex h-9 items-center gap-2 rounded bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"
          >
            Sign in
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <section className="border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5" aria-hidden />
            <h1 className="font-semibold">Newsletter operations unavailable</h1>
          </div>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex h-8 items-center gap-2 rounded bg-gray-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
        </section>
      </div>
    )
  }

  const deliveryCount = Object.values(
    snapshot.beehiiv.marketDateCounts,
  ).reduce(
    (total, count) => total + count,
    0,
  )
  const exceptions = snapshot.dailyRun?.exceptions ?? []

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end gap-4 border-b border-gray-200 pb-5 dark:border-gray-800">
        <div>
          <p className="text-xs font-semibold uppercase text-sage-700 dark:text-sage-400">
            {formatDate(snapshot.marketDate)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
            Newsletter Operations
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`hidden border px-2 py-1 text-[10px] font-semibold uppercase sm:inline-flex ${
              snapshot.clock.isTradingDay
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
            }`}
          >
            {snapshot.clock.isTradingDay
              ? 'Trading day'
              : snapshot.clock.holidayName ?? 'Market closed'}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Refresh newsletter operations"
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        </div>
      </header>

      {notice || error ? (
        <div
          className={`mt-4 flex items-center gap-2 border-l-2 px-3 py-2 text-xs ${
            error
              ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300'
              : 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
          role="status"
        >
          {error ? (
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {error ?? notice}
        </div>
      ) : null}

      <section className="mt-5 grid grid-cols-2 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-4">
        <SummaryCell
          icon={Activity}
          label="Morning"
          value={displayStatus(snapshot.morning?.status)}
          detail={snapshot.morning?.stageLabel ?? 'No run'}
          tone={
            isTerminal(snapshot.morning)
              ? 'good'
              : snapshot.morning?.status === 'failed'
                ? 'bad'
                : 'neutral'
          }
        />
        <SummaryCell
          icon={Clock3}
          label="Mid-morning"
          value={displayStatus(snapshot.midMorning?.status)}
          detail={snapshot.midMorning?.stageLabel ?? 'No run'}
          tone={
            isTerminal(snapshot.midMorning)
              ? 'good'
              : snapshot.midMorning?.status === 'failed'
                ? 'bad'
                : 'neutral'
          }
        />
        <SummaryCell
          icon={Send}
          label="Beehiiv"
          value={
            snapshot.beehiiv.integration.connected
              ? `${deliveryCount} today`
              : 'Disconnected'
          }
          detail={
            snapshot.beehiiv.integration.publication
              ? `${snapshot.beehiiv.integration.publication.name} · ${snapshot.beehiiv.overallTotal} overall`
              : `${snapshot.beehiiv.staleCount} awaiting reconciliation`
          }
          tone={
            snapshot.beehiiv.reconcileErrors
              ? 'bad'
              : snapshot.beehiiv.integration.connected
                ? 'good'
                : 'warning'
          }
        />
        <SummaryCell
          icon={Bell}
          label="Alerts"
          value={`${unreadCount} unread`}
          detail={
            snapshot.webhook.configured
              ? `${snapshot.webhook.pending} pending · ${snapshot.webhook.delivered} delivered`
              : 'In-app only · webhook incomplete'
          }
          tone={
            snapshot.webhook.queryError || snapshot.webhook.errors
              ? 'bad'
              : unreadCount || !snapshot.webhook.configured
                ? 'warning'
                : 'good'
          }
        />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <PipelinePanel
          pipeline="morning"
          run={snapshot.morning}
          busy={Boolean(busyKey?.startsWith('morning:'))}
          onAction={(pipeline, action) => void runAction(pipeline, action)}
        />
        <PipelinePanel
          pipeline="mid_morning"
          run={snapshot.midMorning}
          busy={Boolean(busyKey?.startsWith('mid_morning:'))}
          onAction={(pipeline, action) => void runAction(pipeline, action)}
        />
      </div>

      <ProviderHealth snapshot={snapshot} />

      {exceptions.length ? (
        <section className="mt-5 border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 dark:border-amber-900">
            <TriangleAlert
              className="h-4 w-4 text-amber-700 dark:text-amber-400"
              aria-hidden
            />
            <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
              Issue retries
            </h2>
            <span className="ml-auto text-xs font-semibold text-amber-800 dark:text-amber-300">
              {exceptions.length}
            </span>
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-900">
            {exceptions.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[80px_110px_80px_1fr_auto] sm:items-center"
              >
                <span className="font-bold text-amber-950 dark:text-amber-200">
                  {item.ticker}
                </span>
                <span>{displayStatus(item.status)}</span>
                <span className="tabular-nums">Retry {item.retryCount}</span>
                <span className="min-w-0 truncate text-amber-900 dark:text-amber-300">
                  {item.errorMessage ?? 'Recovered after retry'}
                </span>
                {item.draftId ? (
                  <Link
                    href={`/newsletter/editor/${item.draftId}`}
                    className="inline-flex items-center gap-1 font-semibold text-amber-950 underline underline-offset-2 dark:text-amber-200"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <DeliverySection
          snapshot={snapshot}
          busy={busyKey === 'beehiiv:reconcile'}
          onReconcile={() => void reconcileBeehiiv()}
        />
        <div className="grid content-start gap-4">
          <WebhookHealthSection snapshot={snapshot} />
          <NotificationSection
            snapshot={snapshot}
            busy={busyKey === 'notifications'}
            onMarkAllRead={() => void markAllRead()}
          />
        </div>
      </div>

      <RecentRuns snapshot={snapshot} />
    </div>
  )
}
