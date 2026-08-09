'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Circle,
  Clock3,
  CloudCog,
  ExternalLink,
  FileText,
  LoaderCircle,
  Play,
  RefreshCw,
  Send,
  Settings2,
  Square,
} from 'lucide-react'
import type {
  NewsletterDailyItemStatus,
  NewsletterNotification,
  NewsletterDailyRun,
  NewsletterDailyRunItem,
  NewsletterDailySettings,
} from '@/lib/newsletter/daily-types'
import type { NewsletterDailyAutomationRun } from '@/lib/newsletter/daily-automation'
import {
  hydratePublicNewsletterMorningAutomation,
  hydratePublicNewsletterMorningReport,
  type PublicNewsletterMorningAutomation,
  type PublicNewsletterMorningReport,
} from '@/lib/newsletter/public-morning-report'
import NewsletterEditorialShortlist, {
  type NewsletterEditorialShortlistDirtyState,
} from './NewsletterEditorialShortlist'

interface DailyRunResponse {
  run: NewsletterDailyRun | null
  settings?: NewsletterDailySettings
  automation?: NewsletterDailyAutomationRun | null
  reportReadOnly?: boolean
  automationReadOnly?: boolean
  attempted?: number
  generated?: number
  failed?: number
  error?: string
}

interface DailyRunWireResponse extends Omit<
  DailyRunResponse,
  'run' | 'automation'
> {
  run: NewsletterDailyRun | PublicNewsletterMorningReport | null
  automation?:
    | NewsletterDailyAutomationRun
    | PublicNewsletterMorningAutomation
    | null
}

interface NotificationResponse {
  notifications?: NewsletterNotification[]
  error?: string
}

interface DeliveryResponse {
  delivery?: {
    id: string
    postId: string
    editorUrl: string
  }
  mode?: 'created' | 'updated' | 'unchanged'
  error?: string
  reconnectRequired?: boolean
}

async function readDailyRunPayload(response: Response): Promise<DailyRunResponse> {
  const payload = (await response.json().catch(() => ({}))) as DailyRunWireResponse
  if (!response.ok) {
    throw new Error(payload.error || 'Newsletter queue request failed')
  }

  return {
    ...payload,
    run:
      payload.reportReadOnly && payload.run
        ? hydratePublicNewsletterMorningReport(
            payload.run as PublicNewsletterMorningReport,
          )
        : payload.run as NewsletterDailyRun | null,
    automation: payload.automationReadOnly
      ? hydratePublicNewsletterMorningAutomation(
          payload.automation as PublicNewsletterMorningAutomation | null,
        )
      : payload.automation as NewsletterDailyAutomationRun | null | undefined,
  }
}

type QueueFilter =
  | 'all'
  | 'generated'
  | 'ready'
  | 'attention'
  | 'published'

const FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'all', label: 'All issues' },
  { id: 'generated', label: 'Review' },
  { id: 'ready', label: 'Ready' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'published', label: 'Published' },
]

const TARGET_COUNTS = [30, 40, 50] as const
const MORNING_REVIEW_PAGE_SIZE = 12
const ACTIVE_AUTOMATION_POLL_MS = 15_000
const IDLE_AUTOMATION_POLL_MS = 60_000
const NOTIFICATION_REQUEST_TIMEOUT_MS = 8_000
const UNSAVED_SHORTLIST_ROLLOVER_NOTICE =
  'A newer Morning Report is available. Save or reset the editorial shortlist before loading it.'
const APPLIED_SHORTLIST_ROLLOVER_NOTICE =
  'The newer Morning Report was loaded after the editorial shortlist was saved or reset.'

type RunSnapshotSource = 'passive' | 'interactive'

function getRunIdentity(run: NewsletterDailyRun | null): string | null {
  return run ? `${run.marketDate}:${run.edition}:${run.id}` : null
}

function statusLabel(status: NewsletterDailyItemStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'generating':
      return 'Generating'
    case 'generated':
      return 'Review'
    case 'ready':
      return 'Ready'
    case 'needs_attention':
      return 'Attention'
    case 'failed':
      return 'Failed'
    case 'published':
      return 'Published'
  }
}

function statusClass(status: NewsletterDailyItemStatus): string {
  switch (status) {
    case 'ready':
    case 'published':
      return 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300'
    case 'failed':
    case 'needs_attention':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
    case 'generating':
      return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
  }
}

function formatMove(value: number | null): string {
  if (value == null) return 'N/A'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function moveClass(value: number | null): string {
  if (value == null) return 'text-gray-600 dark:text-gray-400'
  return value >= 0
    ? 'text-green-700 dark:text-green-400'
    : 'text-red-700 dark:text-red-400'
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Not available'
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

function matchesFilter(item: NewsletterDailyRunItem, filter: QueueFilter) {
  if (filter === 'all') return true
  if (filter === 'generated') {
    return item.status === 'generated' || item.status === 'generating'
  }
  if (filter === 'ready') return item.status === 'ready'
  if (filter === 'published') return item.status === 'published'
  return item.status === 'needs_attention' || item.status === 'failed'
}

function firstSource(item: NewsletterDailyRunItem) {
  return (
    item.sourceRefs.find(
      (source) =>
        Boolean(source.url) &&
        (source.kind === 'news' || source.kind === 'finviz'),
    ) ?? item.sourceRefs.find((source) => Boolean(source.url))
  )
}

const LIFECYCLE_STEPS = [
  'Generated',
  'Ready',
  'Beehiiv draft',
  'Scheduled',
  'Published',
] as const

function lifecycleProgress(item: NewsletterDailyRunItem): number {
  const delivery = item.beehiivDelivery
  if (
    item.status === 'published' ||
    delivery?.lifecycleStatus === 'published'
  ) {
    return 5
  }
  if (delivery?.lifecycleStatus === 'scheduled') return 4
  if (delivery) return 3
  if (item.draftStatus === 'ready') return 2
  if (item.draftId) return 1
  return 0
}

function DeliveryLifecycle({ item }: { item: NewsletterDailyRunItem }) {
  const progress = lifecycleProgress(item)
  return (
    <ol
      aria-label={`${item.ticker} delivery lifecycle`}
      className="mt-3 grid grid-cols-5 gap-1 border-y border-gray-100 py-2 dark:border-gray-800"
    >
      {LIFECYCLE_STEPS.map((step, index) => {
        const complete = index < progress
        const active = index === progress
        return (
          <li key={step} className="min-w-0 text-center">
            <span
              className={`mx-auto flex h-4 w-4 items-center justify-center rounded-full ${
                complete
                  ? 'bg-sage-700 text-white'
                  : active
                    ? 'border-2 border-sage-600 bg-white text-sage-700 dark:bg-gray-900'
                    : 'border border-gray-300 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              {complete ? (
                <Check className="h-2.5 w-2.5" aria-hidden />
              ) : (
                <Circle className="h-1.5 w-1.5 fill-current" aria-hidden />
              )}
            </span>
            <span
              className={`mt-1 block truncate text-[9px] font-semibold ${
                complete || active
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
              title={step}
            >
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function QueueCard({
  item,
  readOnly,
  selected,
  onSelectedChange,
  beehiivBusy,
  onBeehiivSync,
}: {
  item: NewsletterDailyRunItem
  readOnly: boolean
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  beehiivBusy: boolean
  onBeehiivSync: () => void
}) {
  const source = firstSource(item)
  const editorPath = !readOnly && item.draftId
    ? `/newsletter/editor/${item.draftId}`
    : null
  const editorHref =
    readOnly && item.draftId
      ? '/auth?redirect=%2Fnewsletter%2Fmorning-review'
      : editorPath
  const selectable =
    !readOnly &&
    (item.status === 'generated' ||
      item.status === 'needs_attention' ||
      item.status === 'ready')

  return (
    <article
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '620px' }}
    >
      <div className="flex h-11 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
        <label className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={(event) => onSelectedChange(event.target.checked)}
            className="h-4 w-4 accent-sage-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Select ${item.ticker}`}
          />
        </label>
        <span className="text-xs font-semibold text-gray-500">
          #{item.rank}
        </span>
        <Link
          href={`/stock/${encodeURIComponent(item.ticker)}#catalyst-history`}
          className="text-sm font-bold text-gray-950 hover:text-sage-700 dark:text-white dark:hover:text-sage-300"
          aria-label={`${item.ticker} catalyst history`}
        >
          {item.ticker}
        </Link>
        <span className={`text-xs font-semibold ${moveClass(item.movePercent)}`}>
          {formatMove(item.movePercent)}
        </span>
        <span
          className={`ml-auto inline-flex shrink-0 items-center border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(item.status)}`}
        >
          {item.status === 'generating' ? (
            <LoaderCircle className="mr-1 h-3 w-3 animate-spin" aria-hidden />
          ) : null}
          {statusLabel(item.status)}
        </span>
      </div>

      <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-950">
        {item.chartImageUrl ? (
          <img
            src={item.chartImageUrl}
            alt={`${item.ticker} newsletter chart`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-medium text-gray-500">
            {item.status === 'generating' ? 'Rendering chart...' : 'Chart queued'}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {item.reasonType?.replace(/_/g, ' ') || 'market catalyst'}
          </span>
          <span
            className={`px-2 py-0.5 text-[10px] font-semibold uppercase ${
              item.qualityBand === 'strong'
                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            {item.qualityBand}
          </span>
          <span className="ml-auto text-[11px] font-semibold text-gray-500">
            Score {Math.round(item.relevanceScore)}
          </span>
        </div>

        <h2 className="mt-3 text-[15px] font-semibold leading-5 text-gray-950 dark:text-white">
          {item.subjectLine || item.headline}
        </h2>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-600 dark:text-gray-400">
          {item.summaryText}
        </p>

        <DeliveryLifecycle item={item} />

        {item.errorMessage ? (
          <p className="mt-3 border-l-2 border-amber-400 pl-2 text-[11px] leading-4 text-amber-800 dark:text-amber-300">
            {item.errorMessage}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {editorHref ? (
            <Link
              href={editorHref}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-gray-950 px-3 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {readOnly ? 'Sign in to edit' : 'Open email'}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center px-1 text-xs font-medium text-gray-500">
              Draft not created
            </span>
          )}
          {item.draftId && !readOnly ? (
            item.beehiivDelivery &&
            !item.beehiivDelivery.needsSync ? (
              <a
                href={item.beehiivDelivery.editorUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open Beehiiv
              </a>
            ) : (
              <button
                type="button"
                onClick={onBeehiivSync}
                disabled={beehiivBusy}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                {beehiivBusy ? (
                  <LoaderCircle
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden
                  />
                ) : item.beehiivDelivery ? (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden />
                )}
                {item.beehiivDelivery ? 'Sync Beehiiv' : 'Create in Beehiiv'}
              </button>
            )
          ) : null}
          {readOnly &&
          item.beehiivDelivery?.lifecycleStatus === 'published' &&
          item.beehiivDelivery.webUrl ? (
            <a
              href={item.beehiivDelivery.webUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Read published issue
            </a>
          ) : null}
          {source?.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={`Open ${source.kind} source`}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded border border-gray-200 text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">Open source</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default function NewsletterMorningReview() {
  const [run, setRun] = useState<NewsletterDailyRun | null>(null)
  const [settings, setSettings] = useState<NewsletterDailySettings>({
    enabled: true,
    targetCount: 40,
    timezone: 'America/New_York',
    generationHour: 8,
  })
  const [automation, setAutomation] =
    useState<NewsletterDailyAutomationRun | null>(null)
  const [reportReadOnly, setReportReadOnly] = useState(false)
  const [notifications, setNotifications] = useState<
    NewsletterNotification[]
  >([])
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [visibleIssueLimit, setVisibleIssueLimit] = useState(
    MORNING_REVIEW_PAGE_SIZE,
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [beehiivBusyIds, setBeehiivBusyIds] = useState<Set<string>>(
    new Set(),
  )
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const stopRequested = useRef(false)
  const browserNotifiedIds = useRef<Set<string>>(new Set())
  const runSnapshotRef = useRef<NewsletterDailyRun | null>(null)
  const runIdentityRef = useRef<string | null>(null)
  const shortlistDirtyStateRef =
    useRef<NewsletterEditorialShortlistDirtyState | null>(null)
  const pendingRunSnapshotRef = useRef<NewsletterDailyRun | null | undefined>(
    undefined,
  )
  const notificationMarketDateRef = useRef<string | null>(null)
  const pollDelayRef = useRef(IDLE_AUTOMATION_POLL_MS)
  const replaceRefreshRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  )
  const supersedePassiveReadsRef = useRef<() => void>(() => undefined)

  pollDelayRef.current =
    automation?.status === 'running'
      ? ACTIVE_AUTOMATION_POLL_MS
      : IDLE_AUTOMATION_POLL_MS

  const commitRunSnapshot = useCallback((nextRun: NewsletterDailyRun | null) => {
    const nextIdentity = getRunIdentity(nextRun)
    const previousIdentity = runIdentityRef.current
    const identityChanged =
      previousIdentity !== null && previousIdentity !== nextIdentity
    runIdentityRef.current = nextIdentity
    runSnapshotRef.current = nextRun

    setRun(nextRun)
    if (identityChanged) {
      shortlistDirtyStateRef.current = null
      setSelectedIds(new Set())
      setBeehiivBusyIds(new Set())
      setVisibleIssueLimit(MORNING_REVIEW_PAGE_SIZE)
      notificationMarketDateRef.current = null
      setNotifications([])
      return
    }

    if (nextRun) {
      const availableIds = new Set(
        nextRun.items
          .filter(
            (item) =>
              item.status === 'generated' ||
              item.status === 'needs_attention' ||
              item.status === 'ready',
          )
          .map((item) => item.id),
      )
      setSelectedIds((current) => {
        const next = new Set(
          Array.from(current).filter((id) => availableIds.has(id)),
        )
        return next.size === current.size ? current : next
      })
    }
  }, [])

  const applyRunSnapshot = useCallback((
    nextRun: NewsletterDailyRun | null,
    source: RunSnapshotSource,
  ) => {
    const previousIdentity = runIdentityRef.current
    const nextIdentity = getRunIdentity(nextRun)
    const identityChanged =
      previousIdentity !== null && previousIdentity !== nextIdentity
    const hasUnsavedShortlist = Boolean(
      identityChanged &&
      shortlistDirtyStateRef.current?.runIdentity === previousIdentity &&
      shortlistDirtyStateRef.current.dirty,
    )

    if (hasUnsavedShortlist) {
      pendingRunSnapshotRef.current = nextRun
      if (
        source === 'passive' ||
        !window.confirm(
          'Replace this Morning Report and discard your unsaved editorial shortlist decisions?',
        )
      ) {
        setNotice(UNSAVED_SHORTLIST_ROLLOVER_NOTICE)
        return false
      }
    }

    pendingRunSnapshotRef.current = undefined
    commitRunSnapshot(nextRun)
    return true
  }, [commitRunSnapshot])

  const handleShortlistDirtyStateChange = useCallback((
    nextState: NewsletterEditorialShortlistDirtyState,
  ) => {
    if (nextState.runIdentity !== runIdentityRef.current) return
    shortlistDirtyStateRef.current = nextState
    if (nextState.dirty || pendingRunSnapshotRef.current === undefined) return

    const pendingRun = pendingRunSnapshotRef.current
    pendingRunSnapshotRef.current = undefined
    commitRunSnapshot(pendingRun)
    setNotice(APPLIED_SHORTLIST_ROLLOVER_NOTICE)
  }, [commitRunSnapshot])

  useEffect(() => {
    type ActiveRefresh = {
      generation: number
      controller: AbortController
      promise: Promise<void>
    }
    type ActiveNotificationRefresh = {
      generation: number
      controller: AbortController
    }

    let disposed = false
    let generation = 0
    let notificationGeneration = 0
    let timer: number | null = null
    let activeRefresh: ActiveRefresh | null = null
    let activeNotificationRefresh: ActiveNotificationRefresh | null = null
    let initialLoadPending = true

    function clearTimer() {
      if (timer == null) return
      window.clearTimeout(timer)
      timer = null
    }

    function cancelActiveRefresh() {
      generation += 1
      activeRefresh?.controller.abort()
      activeRefresh = null
    }

    function cancelActiveNotificationRefresh() {
      notificationGeneration += 1
      activeNotificationRefresh?.controller.abort()
      activeNotificationRefresh = null
    }

    function scheduleNextRefresh() {
      clearTimer()
      if (disposed || document.hidden) return
      timer = window.setTimeout(() => {
        timer = null
        void startRefresh(false)
      }, pollDelayRef.current)
    }

    function isCurrentRefresh(
      requestGeneration: number,
      controller: AbortController,
    ) {
      return (
        !disposed &&
        !controller.signal.aborted &&
        activeRefresh?.generation === requestGeneration
      )
    }

    function isCurrentNotificationRefresh(
      requestGeneration: number,
    ) {
      return (
        !disposed &&
        activeNotificationRefresh?.generation === requestGeneration
      )
    }

    async function performNotificationRefresh(
      marketDate: string,
      requestGeneration: number,
      controller: AbortController,
    ) {
      let timeoutId: number | null = null
      let handleAbort: (() => void) | null = null
      const requestBoundary = new Promise<never>((_, reject) => {
        handleAbort = () => {
          reject(
            controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new Error('Newsletter notification request was cancelled'),
          )
        }
        controller.signal.addEventListener('abort', handleAbort, { once: true })
        timeoutId = window.setTimeout(() => {
          const timeoutError = new Error(
            'Newsletter notifications took too long to load',
          )
          reject(timeoutError)
          controller.abort(timeoutError)
        }, NOTIFICATION_REQUEST_TIMEOUT_MS)
      })

      try {
        const notificationRequest = (async () => {
          const response = await fetch(
            `/api/newsletter/notifications?marketDate=${encodeURIComponent(marketDate)}`,
            {
              cache: 'no-store',
              credentials: 'include',
              signal: controller.signal,
            },
          )
          const payload =
            (await response.json().catch(() => ({}))) as NotificationResponse
          return { response, payload }
        })()
        const { response, payload } = await Promise.race([
          notificationRequest,
          requestBoundary,
        ])
        if (!response.ok) {
          throw new Error(
            payload.error || 'Failed to load notifications',
          )
        }
        if (!isCurrentNotificationRefresh(requestGeneration)) return
        setNotifications(payload.notifications ?? [])
        setNotificationError(null)
      } catch (err) {
        if (!isCurrentNotificationRefresh(requestGeneration)) return
        setNotificationError(
          err instanceof Error
            ? err.message
            : 'Failed to load newsletter notifications',
        )
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId)
        if (handleAbort) {
          controller.signal.removeEventListener('abort', handleAbort)
        }
        if (!isCurrentNotificationRefresh(requestGeneration)) return
        activeNotificationRefresh = null
      }
    }

    function startNotificationRefresh(marketDate: string) {
      cancelActiveNotificationRefresh()
      if (disposed || document.hidden) return

      if (notificationMarketDateRef.current !== marketDate) {
        notificationMarketDateRef.current = marketDate
        setNotifications([])
        setNotificationError(null)
      }

      const controller = new AbortController()
      const requestGeneration = ++notificationGeneration
      activeNotificationRefresh = {
        generation: requestGeneration,
        controller,
      }
      void performNotificationRefresh(
        marketDate,
        requestGeneration,
        controller,
      )
    }

    async function performRefresh(
      requestGeneration: number,
      controller: AbortController,
      showLoading: boolean,
      source: RunSnapshotSource,
    ) {
      try {
        if (showLoading) {
          setLoading(true)
          setError(null)
        }
        const response = await fetch('/api/newsletter/daily-runs', {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        })
        const payload = await readDailyRunPayload(response)
        if (!isCurrentRefresh(requestGeneration, controller)) return

        setError(null)
        pollDelayRef.current =
          payload.automation?.status === 'running'
            ? ACTIVE_AUTOMATION_POLL_MS
            : IDLE_AUTOMATION_POLL_MS
        const snapshotApplied = applyRunSnapshot(payload.run, source)
        if (payload.settings) setSettings(payload.settings)
        setAutomation(payload.automation ?? null)
        setReportReadOnly(Boolean(payload.reportReadOnly))
        if (showLoading) {
          initialLoadPending = false
          setLoading(false)
        }

        const notificationMarketDate = payload.reportReadOnly
          ? null
          : (snapshotApplied ? payload.run : runSnapshotRef.current)?.marketDate ?? null
        if (!notificationMarketDate) {
          cancelActiveNotificationRefresh()
          notificationMarketDateRef.current = null
          setNotifications([])
          setNotificationError(null)
          return
        }
        startNotificationRefresh(notificationMarketDate)
      } catch (err) {
        if (!isCurrentRefresh(requestGeneration, controller)) return
        setError(err instanceof Error ? err.message : 'Failed to load queue')
      } finally {
        if (!isCurrentRefresh(requestGeneration, controller)) return
        activeRefresh = null
        if (showLoading) {
          initialLoadPending = false
          setLoading(false)
        }
        scheduleNextRefresh()
      }
    }

    function startRefresh(
      replaceActive: boolean,
      source: RunSnapshotSource = 'passive',
    ): Promise<void> {
      clearTimer()
      if (activeRefresh) {
        if (!replaceActive) return activeRefresh.promise
        cancelActiveRefresh()
      }
      if (disposed || document.hidden) return Promise.resolve()

      const controller = new AbortController()
      const requestGeneration = ++generation
      const promise = Promise.resolve().then(() =>
        performRefresh(
          requestGeneration,
          controller,
          initialLoadPending,
          source,
        ),
      )
      activeRefresh = {
        generation: requestGeneration,
        controller,
        promise,
      }
      return promise
    }

    replaceRefreshRef.current = () => startRefresh(true, 'interactive')
    supersedePassiveReadsRef.current = () => {
      clearTimer()
      cancelActiveRefresh()
      cancelActiveNotificationRefresh()
      scheduleNextRefresh()
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        clearTimer()
        cancelActiveRefresh()
        cancelActiveNotificationRefresh()
        return
      }
      void startRefresh(false)
    }

    function handleFocus() {
      if (!document.hidden) void startRefresh(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    if (!document.hidden) void startRefresh(false)

    return () => {
      disposed = true
      clearTimer()
      cancelActiveRefresh()
      cancelActiveNotificationRefresh()
      replaceRefreshRef.current = () => Promise.resolve()
      supersedePassiveReadsRef.current = () => undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [applyRunSnapshot])

  const loadRun = useCallback(
    () => replaceRefreshRef.current(),
    [],
  )

  const applyMutationRun = useCallback(
    (nextRun: NewsletterDailyRun) => {
      supersedePassiveReadsRef.current()
      applyRunSnapshot(nextRun, 'interactive')
    },
    [applyRunSnapshot],
  )

  useEffect(() => {
    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    ) {
      return
    }
    for (const entry of notifications) {
      if (entry.readAt || browserNotifiedIds.current.has(entry.id)) continue
      browserNotifiedIds.current.add(entry.id)
      new Notification(entry.title, {
        body: entry.message,
        tag: entry.id,
      })
    }
  }, [notifications])

  const filteredItems = useMemo(
    () => (run?.items ?? []).filter((item) => matchesFilter(item, filter)),
    [run, filter],
  )
  const visibleItems = filteredItems.slice(0, visibleIssueLimit)
  const latestUnreadNotification = notifications.find(
    (entry) => !entry.readAt,
  )

  const counts = useMemo(() => {
    const items = run?.items ?? []
    return {
      all: items.length,
      generated: items.filter(
        (item) =>
          item.status === 'generated' || item.status === 'generating',
      ).length,
      ready: items.filter((item) => item.status === 'ready').length,
      attention: items.filter(
        (item) =>
          item.status === 'needs_attention' || item.status === 'failed',
      ).length,
      published: items.filter((item) => item.status === 'published').length,
      queued: items.filter((item) => item.status === 'queued').length,
    }
  }, [run])

  const progress = run?.selectedCount
    ? Math.round((run.generatedCount / run.selectedCount) * 100)
    : 0
  const hasQueuedGeneration =
    !run ||
    run.items.some((item) => item.status === 'queued')

  async function saveSettings(next: Partial<NewsletterDailySettings>) {
    if (reportReadOnly) return
    supersedePassiveReadsRef.current()
    try {
      setSavingSettings(true)
      setError(null)
      const response = await fetch('/api/newsletter/daily-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        settings?: NewsletterDailySettings
        error?: string
      }
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || 'Failed to save settings')
      }
      supersedePassiveReadsRef.current()
      setSettings(payload.settings)
      setNotice('Automation settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function markNotificationRead(notificationId: string) {
    supersedePassiveReadsRef.current()
    setNotifications((current) =>
      current.map((entry) =>
        entry.id === notificationId
          ? { ...entry, readAt: new Date().toISOString() }
          : entry,
      ),
    )
    await fetch('/api/newsletter/notifications', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [notificationId] }),
    }).catch(() => undefined)
    supersedePassiveReadsRef.current()
  }

  async function syncBeehiiv(item: NewsletterDailyRunItem) {
    if (reportReadOnly || !item.draftId || beehiivBusyIds.has(item.id)) return
    supersedePassiveReadsRef.current()
    const beehiivWindow = window.open(
      'about:blank',
      `finquote-beehiiv-${item.draftId}`,
    )
    if (beehiivWindow) beehiivWindow.opener = null
    setBeehiivBusyIds((current) => new Set(current).add(item.id))
    setError(null)
    try {
      const response = await fetch(
        `/api/newsletter/drafts/${item.draftId}/beehiiv-delivery`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
      const payload =
        (await response.json().catch(() => ({}))) as DeliveryResponse
      if (!response.ok || !payload.delivery) {
        beehiivWindow?.close()
        if (response.status === 401) {
          window.location.assign(
            `/auth?redirect=${encodeURIComponent('/newsletter/morning-review')}`,
          )
          return
        }
        if (payload.reconnectRequired || response.status === 409) {
          window.location.assign(
            `/api/integrations/beehiiv/connect?returnTo=${encodeURIComponent('/newsletter/morning-review')}`,
          )
          return
        }
        throw new Error(payload.error || 'Failed to sync the Beehiiv draft')
      }
      setNotice(
        payload.mode === 'created'
          ? `${item.ticker} Beehiiv draft created.`
          : payload.mode === 'updated'
            ? `${item.ticker} Beehiiv draft synced.`
            : `${item.ticker} Beehiiv draft is already current.`,
      )
      if (beehiivWindow) {
        beehiivWindow.location.replace(payload.delivery.editorUrl)
      } else {
        window.open(payload.delivery.editorUrl, '_blank', 'noopener,noreferrer')
      }
      await loadRun()
    } catch (err) {
      beehiivWindow?.close()
      setError(
        err instanceof Error ? err.message : 'Failed to sync Beehiiv draft',
      )
    } finally {
      setBeehiivBusyIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  async function processBatches(runId: string, retryFailed: boolean) {
    let currentRun = run
    let retryBudget = retryFailed
      ? (currentRun?.items ?? []).filter(
          (item) =>
            item.status === 'queued' ||
            item.status === 'failed' ||
            item.status === 'needs_attention',
        ).length
      : Number.POSITIVE_INFINITY
    do {
      if (stopRequested.current) break
      const response = await fetch(
        `/api/newsletter/daily-runs/${runId}/process`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: 6,
            concurrency: 3,
            retryFailed,
          }),
        },
      )
      const payload = await readDailyRunPayload(response)
      currentRun = payload.run
      if (currentRun) applyMutationRun(currentRun)
      if (!payload.attempted) break
      if (retryFailed) retryBudget -= payload.attempted
    } while (
      (
        retryFailed
          ? retryBudget > 0
          : currentRun?.items.some((item) => item.status === 'queued')
      ) &&
      !stopRequested.current
    )
  }

  async function generateToday(retryFailed = false) {
    if (reportReadOnly) return
    supersedePassiveReadsRef.current()
    try {
      stopRequested.current = false
      setGenerating(true)
      setError(null)
      setNotice(null)
      let runId = run?.id

      if (!runId || !retryFailed) {
        const response = await fetch('/api/newsletter/daily-runs/action', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetCount: settings.targetCount }),
        })
        const payload = await readDailyRunPayload(response)
        if (!payload.run) throw new Error('Daily run was not created')
        applyMutationRun(payload.run)
        runId = payload.run.id
      }

      await processBatches(runId, retryFailed)
      await loadRun()
      const refreshedRun = runSnapshotRef.current
      const remainingQueuedCount = (refreshedRun?.items ?? []).filter(
        (item) => item.status === 'queued' || item.status === 'generating',
      ).length
      const attentionCount = (refreshedRun?.items ?? []).filter(
        (item) =>
          item.status === 'failed' || item.status === 'needs_attention',
      ).length
      setNotice(
        stopRequested.current
          ? 'Generation stopped after the current batch. Resume when ready.'
          : remainingQueuedCount > 0
            ? `Generation paused with ${remainingQueuedCount} ${
                remainingQueuedCount === 1 ? 'issue' : 'issues'
              } still in progress or queued.`
            : attentionCount > 0
              ? `Generation completed with ${attentionCount} ${
                  attentionCount === 1 ? 'issue' : 'issues'
                } needing attention. Retry or review before marking the queue ready.`
              : 'Today\'s newsletter queue is generated and ready for review.',
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Newsletter generation failed',
      )
    } finally {
      setGenerating(false)
      stopRequested.current = false
    }
  }

  function selectCleanIssues() {
    if (reportReadOnly) return
    setSelectedIds(
      new Set(
        (run?.items ?? [])
          .filter((item) => item.status === 'generated' && !item.errorMessage)
          .map((item) => item.id),
      ),
    )
  }

  async function finalizeSelected() {
    if (reportReadOnly || !run || selectedIds.size === 0) return
    supersedePassiveReadsRef.current()
    try {
      setFinalizing(true)
      setError(null)
      setNotice(null)
      const response = await fetch(
        `/api/newsletter/daily-runs/${run.id}/finalize`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: Array.from(selectedIds) }),
        },
      )
      const payload = await readDailyRunPayload(response)
      if (payload.run) applyMutationRun(payload.run)
      setSelectedIds(new Set())
      setNotice('Clean selected issues are marked Ready.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk finalization failed')
    } finally {
      setFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-[1500px] items-center justify-center px-4">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          Loading newsletter production queue
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
            <span>{run?.marketDate ?? 'Today'}</span>
            <span className="h-1 w-1 rounded-full bg-gray-400" />
            <span>Morning production</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
            Morning Newsletter Report
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-gray-600 dark:text-gray-400">
            Today&apos;s WIIM ranking, original summaries, current charts, and
            email-ready newsletters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={
              reportReadOnly
                ? '/auth?redirect=%2Fnewsletter%2Feditor'
                : '/newsletter/editor'
            }
            className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Draft history
          </Link>
          {(counts.attention > 0 || run?.failedCount) && run ? (
            <button
              type="button"
              onClick={() => generateToday(true)}
              disabled={generating || reportReadOnly}
              className="inline-flex h-9 items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
            >
              <RefreshCw
                className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Retry attention
            </button>
          ) : null}
          {generating ? (
            <button
              type="button"
              onClick={() => {
                stopRequested.current = true
              }}
              className="inline-flex h-9 items-center gap-2 rounded bg-gray-950 px-4 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950"
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              Stop after batch
            </button>
          ) : hasQueuedGeneration ? (
            <button
              type="button"
              onClick={() => generateToday(false)}
              disabled={reportReadOnly}
              className="inline-flex h-9 items-center gap-2 rounded bg-sage-700 px-4 text-xs font-semibold text-white transition hover:bg-sage-800"
            >
              <Play className="h-4 w-4" aria-hidden />
              {run ? 'Resume generation' : 'Generate today\'s queue'}
            </button>
          ) : null}
        </div>
      </header>

      {automation ? (
        <section
          aria-label="Overnight automation status"
          className={`mt-4 border-y px-4 py-3 ${
            automation.status === 'failed'
              ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
              : automation.status === 'completed'
              ? 'border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200'
              : automation.status === 'partial'
                ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
          }`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {automation.status === 'running' ? (
                <LoaderCircle
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
                  aria-hidden
                />
              ) : automation.status === 'completed' ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {automation.stage === 'failed'
                    ? 'Morning report did not pass its quality gate'
                    : automation.stage === 'completed'
                    ? 'Morning report ready'
                    : automation.stage === 'finviz'
                      ? 'Refreshing Finviz catalysts'
                      : automation.stage === 'wiim'
                        ? 'Ranking the WIIM report'
                        : automation.stage === 'summaries'
                          ? 'Writing original summaries'
                          : automation.stage === 'newsletters'
                            ? 'Generating charts and emails'
                            : automation.stage === 'finalizing'
                              ? 'Running final quality checks'
                              : 'Collecting market candidates'}
                </p>
                <p className="mt-0.5 text-xs leading-5 opacity-80">
                  {automation.lastError ||
                    `Automatic production started ${formatDateTime(automation.startedAt)} and targets completion before ${settings.generationHour}:00 AM ET.`}
                </p>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-x-6 text-xs">
              <div>
                <p className="font-semibold">
                  {automation.finvizCompletedCount}/{automation.candidateCount}
                </p>
                <p className="opacity-70">Finviz</p>
              </div>
              <div>
                <p className="font-semibold">
                  {automation.summaryGeneratedCount}/{automation.candidateCount}
                </p>
                <p className="opacity-70">Generated</p>
              </div>
              <div>
                <p className="font-semibold">
                  {automation.newsletterReadyCount}/
                  {automation.newsletterSelectedCount || settings.targetCount}
                </p>
                <p className="opacity-70">Ready</p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-4 flex items-center gap-2 border-y border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <CloudCog className="h-4 w-4" aria-hidden />
          No overnight automation record exists for today.
        </section>
      )}

      {reportReadOnly ? (
        <div className="mt-4 flex flex-col gap-2 border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
          <span>
            You are viewing the automated report. Sign in to edit drafts or
            change automation settings.
          </span>
          <Link
            href="/auth?redirect=%2Fnewsletter%2Fmorning-review"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded bg-gray-950 px-3 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      {latestUnreadNotification ? (
        <section
          aria-label="Newsletter notification"
          className={`mt-4 flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center ${
            latestUnreadNotification.severity === 'error'
              ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200'
              : latestUnreadNotification.severity === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                : 'border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950/50 dark:text-green-200'
          }`}
        >
          <Bell className="h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {latestUnreadNotification.title}
            </p>
            <p className="mt-0.5 text-xs leading-5 opacity-80">
              {latestUnreadNotification.message}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {latestUnreadNotification.actionUrl ? (
              <Link
                href={latestUnreadNotification.actionUrl}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-gray-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"
              >
                Open
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void markNotificationRead(latestUnreadNotification.id)
              }
              className="inline-flex h-8 items-center rounded border border-current px-3 text-xs font-semibold opacity-80 transition hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      {notificationError ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Notification updates are unavailable: {notificationError}. The
            production queue is still current.
          </span>
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-4 flex items-start gap-2 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="mt-5 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-200 dark:divide-gray-800 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          {[
            ['Selected', run?.selectedCount ?? 0],
            ['Generated', run?.generatedCount ?? 0],
            ['Ready', run?.readyCount ?? 0],
            ['Attention', run?.attentionCount ?? 0],
            ['Failed', run?.failedCount ?? 0],
            ['Progress', `${progress}%`],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-gray-500">
                {label}
              </p>
              <p className="mt-0.5 text-xl font-semibold text-gray-950 dark:text-white">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-1 bg-sage-600 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      {run ? (
        <NewsletterEditorialShortlist
          key={getRunIdentity(run)}
          run={run}
          readOnly={reportReadOnly}
          onDirtyStateChange={handleShortlistDirtyStateChange}
        />
      ) : null}

      <section className="mt-4 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            WIIM source {formatDateTime(run?.sourceGeneratedAt ?? null)}
          </span>
          <span>
            {Number(run?.metadata.sourceCandidateCount ?? 0)} ranked candidates
          </span>
          <span>
            {Number(run?.metadata.currentSummaryCount ?? 0)} generated summaries
          </span>
          <span>
            {Number(run?.metadata.strongCount ?? 0)} strong selections
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex h-9 items-center rounded border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
            {TARGET_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  setSettings((current) => ({
                    ...current,
                    targetCount: count,
                  }))
                  void saveSettings({ targetCount: count })
                }}
                  disabled={reportReadOnly || savingSettings || generating}
                className={`h-7 min-w-10 rounded px-2 text-xs font-semibold transition ${
                  settings.targetCount === count
                    ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {count}
              </button>
            ))}
          </div>

          <label className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            <span>Ready by</span>
            <select
              value={settings.generationHour}
              disabled={reportReadOnly || savingSettings}
              onChange={(event) => {
                const generationHour = Number(event.target.value)
                setSettings((current) => ({
                  ...current,
                  generationHour,
                }))
                void saveSettings({ generationHour })
              }}
              className="bg-transparent text-xs font-semibold text-gray-950 outline-none dark:text-white"
              aria-label="Newsletter ready-by hour"
            >
              {[7, 8, 9, 10].map((hour) => (
                <option key={hour} value={hour}>
                  {hour}:00 AM ET
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={reportReadOnly || savingSettings}
              onChange={(event) => {
                const enabled = event.target.checked
                setSettings((current) => ({ ...current, enabled }))
                void saveSettings({ enabled })
              }}
              className="h-4 w-4 accent-sage-700"
            />
            Daily automation
          </label>
        </div>
      </section>

      {run ? (
        <>
          <section className="sticky top-[99px] z-30 -mx-4 mt-4 border-y border-gray-200 bg-cream-100/95 px-4 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="mx-auto flex max-w-[1560px] flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-full overflow-x-auto">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setFilter(entry.id)
                      setVisibleIssueLimit(MORNING_REVIEW_PAGE_SIZE)
                    }}
                    className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                      filter === entry.id
                        ? 'border-sage-700 text-gray-950 dark:border-sage-400 dark:text-white'
                        : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {entry.label} {counts[entry.id]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectCleanIssues}
                  disabled={reportReadOnly}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  Select clean
                </button>
                <button
                  type="button"
                  onClick={finalizeSelected}
                  disabled={
                    reportReadOnly || selectedIds.size === 0 || finalizing
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded bg-sage-700 px-3 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {finalizing ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Mark ready {selectedIds.size ? `(${selectedIds.size})` : ''}
                </button>
              </div>
            </div>
          </section>

          {visibleItems.length > 0 ? (
            <section
              aria-label="Generated newsletter issues"
              className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {visibleItems.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  readOnly={reportReadOnly}
                  selected={selectedIds.has(item.id)}
                  beehiivBusy={beehiivBusyIds.has(item.id)}
                  onBeehiivSync={() => void syncBeehiiv(item)}
                  onSelectedChange={(selected) => {
                    setSelectedIds((current) => {
                      const next = new Set(current)
                      if (selected) next.add(item.id)
                      else next.delete(item.id)
                      return next
                    })
                  }}
                />
              ))}
            </section>
          ) : (
            <div className="py-16 text-center text-sm text-gray-500">
              No issues match this filter.
            </div>
          )}
          {filteredItems.length > visibleItems.length ? (
            <div className="mt-5 flex flex-col items-center gap-2 border-t border-gray-200 pt-5 dark:border-gray-800">
              <p className="text-xs text-gray-500">
                Showing {visibleItems.length} of {filteredItems.length} issues
              </p>
              <button
                type="button"
                onClick={() =>
                  setVisibleIssueLimit((current) =>
                    Math.min(
                      filteredItems.length,
                      current + MORNING_REVIEW_PAGE_SIZE,
                    ),
                  )
                }
                className="inline-flex h-9 items-center rounded border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Load more issues
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <section className="mt-10 border-y border-gray-200 bg-white py-14 text-center dark:border-gray-800 dark:bg-gray-900">
          <Settings2 className="mx-auto h-6 w-6 text-gray-400" aria-hidden />
          <h2 className="mt-3 text-base font-semibold text-gray-950 dark:text-white">
            Today&apos;s queue has not been generated
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-5 text-gray-600 dark:text-gray-400">
            The generator will select current WIIM stories, attach charts, and
            create reviewable newsletter drafts in batches.
          </p>
          <button
            type="button"
            onClick={() => generateToday(false)}
            disabled={reportReadOnly}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded bg-sage-700 px-4 text-xs font-semibold text-white transition hover:bg-sage-800"
          >
            <Play className="h-4 w-4" aria-hidden />
            Generate {settings.targetCount} issues
          </button>
        </section>
      )}
    </div>
  )
}
