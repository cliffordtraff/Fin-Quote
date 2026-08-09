'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react'
import type {
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
} from '@/lib/beehiiv/types'
import { beehiivDeliveryNeedsSync } from '@/lib/beehiiv/sync-freshness'
import type { NewsletterDraftRecord } from '@/lib/newsletter/types'

interface NewsletterBeehiivPanelProps {
  record: NewsletterDraftRecord
  disabled?: boolean
  onNotice: (message: string) => void
  onError: (message: string) => void
  onBusyChange?: (busy: boolean) => void
  onCopyFallback: () => Promise<void>
}

interface DeliveryPayload {
  delivery?: BeehiivDeliveryRecord | null
  mode?: 'created' | 'updated' | 'unchanged'
  needsSync?: boolean
  error?: string
  reconnectRequired?: boolean
}

interface IntegrationPayload extends Partial<BeehiivIntegrationStatus> {
  error?: string
}

export interface NewsletterBeehiivPanelHandle {
  deliver: () => Promise<void>
}

const SYNC_LOCKED_STATUSES = new Set([
  'scheduled',
  'published',
  'archived',
])

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'date unavailable'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatFreshness(value: string): string {
  const reconciledAt = new Date(value).getTime()
  if (!Number.isFinite(reconciledAt)) return 'freshness unavailable'
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - reconciledAt) / 1_000),
  )
  if (elapsedSeconds < 60) return 'just now'

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'} ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  return `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} ago`
}

function deliveryStatusPresentation(
  delivery: BeehiivDeliveryRecord | null,
  loadError: string | null,
  loading: boolean,
  needsSync: boolean,
): {
  label: string
  detail: string
  className: string
  icon: typeof FileText
} {
  if (!delivery) {
    if (loading && !loadError) {
      return {
        label: 'Checking status',
        detail: 'Loading the latest reconciled Beehiiv lifecycle.',
        className: 'border-gray-200 bg-gray-50 text-gray-600',
        icon: RefreshCw,
      }
    }
    if (loadError) {
      return {
        label: 'Status unavailable',
        detail: 'The current Beehiiv lifecycle could not be loaded.',
        className: 'border-red-200 bg-red-50 text-red-700',
        icon: AlertTriangle,
      }
    }
    return {
      label: 'Not synced',
      detail:
        'Create the editable email draft here, then finish audience and send settings in Beehiiv.',
      className: 'border-gray-200 bg-gray-50 text-gray-600',
      icon: Send,
    }
  }

  if (needsSync && delivery.lifecycleStatus === 'draft') {
    return {
      label: 'Needs sync',
      detail:
        'Fin Quote has a newer saved version than the content currently in Beehiiv.',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      icon: RefreshCw,
    }
  }

  if (needsSync && delivery.lifecycleStatus === 'scheduled') {
    return {
      label: 'Scheduled version mismatch',
      detail:
        'The Fin Quote record changed after this Beehiiv version was scheduled. If issue content changed, unschedule it in Beehiiv before syncing newer edits.',
      className: 'border-red-200 bg-red-50 text-red-800',
      icon: AlertTriangle,
    }
  }

  if (needsSync && delivery.lifecycleStatus === 'published') {
    return {
      label: 'Published version mismatch',
      detail:
        'The Fin Quote record changed after this Beehiiv version was published. If issue content changed, create a copy for corrections.',
      className: 'border-red-200 bg-red-50 text-red-800',
      icon: AlertTriangle,
    }
  }

  switch (delivery.lifecycleStatus) {
    case 'draft':
      return {
        label: 'Draft',
        detail: `Editable Beehiiv draft synced ${formatDateTime(delivery.syncedAt)}.`,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
        icon: FileText,
      }
    case 'scheduled':
      return {
        label: 'Scheduled',
        detail: delivery.scheduledAt
          ? `Scheduled for ${formatDateTime(delivery.scheduledAt)}.`
          : 'Scheduled in Beehiiv; the scheduled date is unavailable.',
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        icon: CalendarClock,
      }
    case 'published':
      return {
        label: 'Published',
        detail: delivery.publishedAt
          ? `Published ${formatDateTime(delivery.publishedAt)}.`
          : 'Published in Beehiiv; the publication date is unavailable.',
        className: 'border-green-200 bg-green-50 text-green-700',
        icon: CheckCircle2,
      }
    case 'archived':
      return {
        label: 'Archived',
        detail: 'Archived in Beehiiv. Sync is permanently disabled for this issue.',
        className: 'border-gray-300 bg-gray-100 text-gray-700',
        icon: Archive,
      }
    default: {
      const remoteStatus = delivery.beehiivStatus?.trim()
      return {
        label: 'Unknown status',
        detail: remoteStatus
          ? `Beehiiv reported an unrecognized status: “${remoteStatus}”.`
          : 'Beehiiv has not returned a recognized lifecycle status yet.',
        className: 'border-orange-200 bg-orange-50 text-orange-800',
        icon: AlertTriangle,
      }
    }
  }
}

const NewsletterBeehiivPanel = forwardRef<
  NewsletterBeehiivPanelHandle,
  NewsletterBeehiivPanelProps
>(function NewsletterBeehiivPanel(
  {
    record,
    disabled = false,
    onNotice,
    onError,
    onBusyChange,
    onCopyFallback,
  },
  ref,
) {
  const [integration, setIntegration] =
    useState<BeehiivIntegrationStatus | null>(null)
  const [delivery, setDelivery] = useState<BeehiivDeliveryRecord | null>(null)
  const [needsSync, setNeedsSync] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const onErrorRef = useRef(onError)
  const loadSequenceRef = useRef(0)
  const loadControllerRef = useRef<AbortController | null>(null)
  const recordUpdatedAtRef = useRef(record.updatedAt)
  recordUpdatedAtRef.current = record.updatedAt
  const returnTo = `/newsletter/editor/${record.id}`
  const connectUrl = useMemo(
    () =>
      `/api/integrations/beehiiv/connect?returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  )
  const signInUrl = `/auth?redirect=${encodeURIComponent(returnTo)}`

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const loadState = useCallback(async (
    requestedDraftUpdatedAt: string,
  ): Promise<BeehiivIntegrationStatus | null> => {
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    const sequence = ++loadSequenceRef.current
    loadControllerRef.current = controller
    setLoading(true)
    try {
      const [integrationResponse, deliveryResponse] = await Promise.all([
        fetch('/api/integrations/beehiiv', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch(`/api/newsletter/drafts/${record.id}/beehiiv-delivery`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        }),
      ])
      const integrationPayload =
        (await integrationResponse.json().catch(() => ({}))) as IntegrationPayload
      const deliveryPayload =
        (await deliveryResponse.json().catch(() => ({}))) as DeliveryPayload

      if (
        sequence !== loadSequenceRef.current ||
        requestedDraftUpdatedAt !== recordUpdatedAtRef.current
      ) {
        return null
      }

      if (
        integrationResponse.status === 401 ||
        deliveryResponse.status === 401
      ) {
        setAuthRequired(true)
        setIntegration(null)
        setDelivery(null)
        setNeedsSync(false)
        setLoadError(null)
        return null
      }
      if (!integrationResponse.ok) {
        throw new Error(
          integrationPayload.error || 'Failed to load the Beehiiv connection',
        )
      }

      const nextIntegration: BeehiivIntegrationStatus = {
        connected: integrationPayload.connected === true,
        publication: integrationPayload.publication ?? null,
        connectedAt: integrationPayload.connectedAt ?? null,
        lastVerifiedAt: integrationPayload.lastVerifiedAt ?? null,
      }
      setAuthRequired(false)
      setIntegration(nextIntegration)
      if (!deliveryResponse.ok) {
        throw new Error(
          deliveryPayload.error || 'Failed to load Beehiiv delivery status',
        )
      }
      setDelivery(deliveryPayload.delivery ?? null)
      setNeedsSync(deliveryPayload.needsSync === true)
      setLoadError(null)
      return nextIntegration
    } catch (error) {
      if (
        controller.signal.aborted ||
        sequence !== loadSequenceRef.current ||
        requestedDraftUpdatedAt !== recordUpdatedAtRef.current
      ) {
        return null
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load Beehiiv delivery status'
      setLoadError(message)
      onErrorRef.current(message)
      return null
    } finally {
      if (sequence === loadSequenceRef.current) {
        loadControllerRef.current = null
        setLoading(false)
      }
    }
  }, [record.id])

  useEffect(() => {
    void loadState(record.updatedAt)
    return () => loadControllerRef.current?.abort()
  }, [loadState, record.updatedAt])

  useEffect(() => {
    const refreshOnFocus = () => {
      if (!busy && !loading) void loadState(record.updatedAt)
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [busy, loadState, loading, record.updatedAt])

  const syncLocked = Boolean(
    delivery && SYNC_LOCKED_STATUSES.has(delivery.lifecycleStatus),
  )

  const deliver = useCallback(async () => {
    if (disabled || busy || syncLocked) return

    const currentIntegration =
      integration ?? (await loadState(record.updatedAt))
    if (!currentIntegration?.connected) {
      window.location.assign(authRequired ? signInUrl : connectUrl)
      return
    }

    const beehiivWindow = window.open(
      'about:blank',
      'finquote-beehiiv-draft',
    )
    if (beehiivWindow) {
      beehiivWindow.opener = null
    }

    try {
      setBusy(true)
      onBusyChange?.(true)
      const response = await fetch(
        `/api/newsletter/drafts/${record.id}/beehiiv-delivery`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
      const payload = (await response.json().catch(() => ({}))) as DeliveryPayload
      if (!response.ok || !payload.delivery) {
        beehiivWindow?.close()
        if (payload.reconnectRequired || response.status === 409) {
          window.location.assign(connectUrl)
          return
        }
        throw new Error(payload.error || 'Failed to create the Beehiiv draft')
      }

      loadControllerRef.current?.abort()
      loadControllerRef.current = null
      loadSequenceRef.current += 1
      setLoading(false)
      setDelivery(payload.delivery)
      setNeedsSync(payload.needsSync === true)
      const notice =
        payload.mode === 'created'
          ? 'Beehiiv draft created.'
          : payload.mode === 'updated'
            ? 'Beehiiv draft synced with the latest saved issue.'
            : 'Beehiiv draft is already up to date.'
      onNotice(notice)

      if (beehiivWindow) {
        beehiivWindow.location.replace(payload.delivery.editorUrl)
      } else {
        window.open(payload.delivery.editorUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      beehiivWindow?.close()
      onError(
        error instanceof Error
          ? error.message
          : 'Failed to create the Beehiiv draft',
      )
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }, [
    authRequired,
    busy,
    connectUrl,
    disabled,
    integration,
    loadState,
    onBusyChange,
    onError,
    onNotice,
    record.id,
    record.updatedAt,
    signInUrl,
    syncLocked,
  ])

  useImperativeHandle(ref, () => ({ deliver }), [deliver])

  const effectiveNeedsSync = Boolean(
    delivery &&
      (needsSync || beehiivDeliveryNeedsSync(record.updatedAt, delivery)),
  )
  const status = deliveryStatusPresentation(
    delivery,
    loadError,
    loading,
    effectiveNeedsSync,
  )
  const StatusIcon = status.icon
  const reconciliationError = delivery?.lastReconcileError ?? loadError

  return (
    <section
      id="beehiiv-delivery"
      aria-label="Beehiiv draft delivery"
      className="border-b border-gray-200 bg-white px-5 py-4"
    >
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-gray-950">
              Beehiiv delivery
            </h2>
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking connection
              </span>
            ) : integration?.connected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {integration.publication?.name ?? 'Connected'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Link2 className="h-3.5 w-3.5" />
                {authRequired ? 'Sign in required' : 'Not connected'}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${status.className}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <p className="text-xs leading-5 text-gray-600">{status.detail}</p>
            {delivery?.lifecycleStatus === 'published' ? (
              delivery.webUrl ? (
                <a
                  href={delivery.webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sage-700 underline decoration-sage-300 underline-offset-2 hover:text-sage-900"
                >
                  View published issue
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="text-xs font-medium text-amber-700">
                  Published URL unavailable
                </span>
              )
            ) : null}
          </div>
          {delivery ? (
            <p className="mt-1.5 text-xs leading-5 text-gray-500">
              Synced {formatDateTime(delivery.syncedAt)} ·{' '}
              {delivery.lastReconciledAt
                ? `Last reconciled ${formatDateTime(delivery.lastReconciledAt)} (${formatFreshness(delivery.lastReconciledAt)})`
                : 'Not reconciled yet'}
            </p>
          ) : null}
          {reconciliationError ? (
            <p
              role="alert"
              className="mt-2 inline-flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-700"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {delivery?.lastReconcileError
                  ? `Reconciliation error: ${delivery.lastReconcileError}`
                  : reconciliationError}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!loading && !integration?.connected ? (
            <a
              href={authRequired ? signInUrl : connectUrl}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
            >
              <Link2 className="h-4 w-4" />
              {authRequired ? 'Sign in' : 'Connect Beehiiv'}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void deliver()}
              disabled={disabled || busy || loading || syncLocked}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                syncLocked
                  ? `Sync is disabled because this issue is ${delivery?.lifecycleStatus}.`
                  : undefined
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : syncLocked ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : delivery ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {busy
                ? 'Syncing'
                : syncLocked
                  ? 'Sync locked'
                  : delivery
                    ? 'Sync and open'
                    : 'Create draft'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadState(record.updatedAt)}
            disabled={loading || busy}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
            title="Fetch the latest reconciled Beehiiv status"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>

          {delivery ? (
            <a
              href={delivery.editorUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => void onCopyFallback()}
            disabled={disabled || busy}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
            title="Copy the HTML and open a blank Beehiiv draft"
          >
            <Copy className="h-4 w-4" />
            HTML fallback
          </button>
        </div>
      </div>
    </section>
  )
})

export default NewsletterBeehiivPanel
