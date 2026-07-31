'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react'
import type {
  BeehiivDeliveryRecord,
  BeehiivIntegrationStatus,
} from '@/lib/beehiiv/types'
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
  error?: string
  reconnectRequired?: boolean
}

interface IntegrationPayload extends Partial<BeehiivIntegrationStatus> {
  error?: string
}

export interface NewsletterBeehiivPanelHandle {
  deliver: () => Promise<void>
}

function formatSyncTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const returnTo = `/newsletter/editor/${record.id}`
  const connectUrl = useMemo(
    () =>
      `/api/integrations/beehiiv/connect?returnTo=${encodeURIComponent(returnTo)}`,
    [returnTo],
  )
  const signInUrl = `/auth?redirect=${encodeURIComponent(returnTo)}`

  const loadState = useCallback(async (): Promise<BeehiivIntegrationStatus | null> => {
    setLoading(true)
    try {
      const [integrationResponse, deliveryResponse] = await Promise.all([
        fetch('/api/integrations/beehiiv', {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(`/api/newsletter/drafts/${record.id}/beehiiv-delivery`, {
          credentials: 'include',
          cache: 'no-store',
        }),
      ])
      const integrationPayload =
        (await integrationResponse.json().catch(() => ({}))) as IntegrationPayload
      const deliveryPayload =
        (await deliveryResponse.json().catch(() => ({}))) as DeliveryPayload

      if (integrationResponse.status === 401) {
        setAuthRequired(true)
        setIntegration(null)
        setDelivery(null)
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
      setDelivery(
        deliveryResponse.ok ? deliveryPayload.delivery ?? null : null,
      )
      return nextIntegration
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : 'Failed to load Beehiiv delivery status',
      )
      return null
    } finally {
      setLoading(false)
    }
  }, [onError, record.id])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const deliver = useCallback(async () => {
    if (disabled || busy) return

    const currentIntegration = integration ?? (await loadState())
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

      setDelivery(payload.delivery)
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
    signInUrl,
  ])

  useImperativeHandle(ref, () => ({ deliver }), [deliver])

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
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {delivery
              ? `Draft synced ${formatSyncTime(delivery.syncedAt)}. Publish or schedule after review in Beehiiv.`
              : 'Create the editable email draft here, then finish audience and send settings in Beehiiv.'}
          </p>
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
              disabled={disabled || busy || loading}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : delivery ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {busy
                ? 'Syncing'
                : delivery
                  ? 'Sync and open'
                  : 'Create draft'}
            </button>
          )}

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
