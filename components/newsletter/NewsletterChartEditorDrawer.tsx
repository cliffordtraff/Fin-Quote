'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  parseFundamentalsNewsletterChartSpecFromFundState,
  parsePriceNewsletterChartSpecFromState,
  resolveNewsletterChartEditor,
  resolveNewsletterPriceChartEditor,
} from '@/lib/newsletter/chart-editor'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  PriceNewsletterChartSpec,
} from '@/lib/newsletter/types'

const PM_VERSION = 1
const READ_STATE_TIMEOUT_MS = 3000

interface NewsletterChartEditorDrawerProps {
  draftId: string
  draft: NewsletterDraftDocument
  block: NewsletterDraftBlock
  onClose: () => void
  onSaved: (record: NewsletterDraftRecord) => void
}

interface FundStateResponse {
  fundState: Record<string, unknown> | null
  symbol: string
}

interface PriceStateResponse {
  priceState: Record<string, unknown> | null
  symbol: string
}

type StateResponse =
  | { kind: 'fundamentals'; response: FundStateResponse | null }
  | { kind: 'price'; response: PriceStateResponse | null }

function resolveEditor(block: NewsletterDraftBlock) {
  if (isPriceNewsletterChartSpec(block.chartSpec)) {
    const spec = block.chartSpec as PriceNewsletterChartSpec
    const resolved = resolveNewsletterPriceChartEditor(spec)
    return {
      kind: 'price' as const,
      iframePath: resolved.iframePath,
      symbol: resolved.symbol,
    }
  }
  const resolved = resolveNewsletterChartEditor(
    block.chartSpec as FundamentalsNewsletterChartSpec,
  )
  return {
    kind: 'fundamentals' as const,
    iframePath: resolved.iframePath,
    fundState: resolved.fundState,
    symbol: resolved.symbol,
  }
}

export default function NewsletterChartEditorDrawer({
  draftId,
  draft,
  block,
  onClose,
  onSaved,
}: NewsletterChartEditorDrawerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const editorReadyRef = useRef(false)
  const fundStateResolveRef = useRef<((result: FundStateResponse | null) => void) | null>(
    null,
  )
  const priceStateResolveRef = useRef<((result: PriceStateResponse | null) => void) | null>(
    null,
  )

  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [chartVisible, setChartVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editor] = useState(() => resolveEditor(block))
  const iframeSrc = editor.iframePath

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow) return
      if (event.origin !== window.location.origin) return

      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.v !== PM_VERSION || typeof data.type !== 'string') return

      if (data.type === 'READY') {
        editorReadyRef.current = true
        setStatus('ready')
        const sendTheme = () =>
          iframeWindow.postMessage(
            { v: PM_VERSION, type: 'SET_THEME', payload: { theme: 'light' } },
            '*',
          )
        sendTheme()
        if (editor.kind === 'fundamentals') {
          iframeWindow.postMessage(
            {
              v: PM_VERSION,
              type: 'APPLY_FUND_STATE',
              payload: { fundState: editor.fundState },
            },
            '*',
          )
        } else {
          const syncPriceWorkspace = () => {
            iframeWindow.postMessage(
              {
                v: PM_VERSION,
                type: 'SET_WORKSPACE_MODE',
                payload: { mode: 'price' },
              },
              '*',
            )
            iframeWindow.postMessage(
              {
                v: PM_VERSION,
                type: 'SET_SYMBOL',
                payload: { symbolId: editor.symbol },
              },
              '*',
            )
          }
          syncPriceWorkspace()
          setTimeout(syncPriceWorkspace, 180)
        }
        // Re-apply theme after the chart reload settles, since the chart may
        // re-initialize with its bootstrap theme and lose our first SET_THEME.
        setTimeout(sendTheme, 800)
        setTimeout(() => setChartVisible(true), 500)
        return
      }

      if (data.type === 'FUND_STATE') {
        const resolve = fundStateResolveRef.current
        if (!resolve) return
        fundStateResolveRef.current = null

        const payload = data.payload as Record<string, unknown> | undefined
        resolve(
          payload
            ? {
                fundState:
                  (payload.fundState as Record<string, unknown> | null) ?? null,
                symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
              }
            : null,
        )
        return
      }

      if (data.type === 'PRICE_STATE') {
        const resolve = priceStateResolveRef.current
        if (!resolve) return
        priceStateResolveRef.current = null

        const payload = data.payload as Record<string, unknown> | undefined
        resolve(
          payload
            ? {
                priceState:
                  (payload.priceState as Record<string, unknown> | null) ?? null,
                symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
              }
            : null,
        )
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [editor])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, saving])

  const requestState = useCallback((): Promise<StateResponse> => {
    return new Promise((resolve) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || !editorReadyRef.current) {
        resolve(
          editor.kind === 'fundamentals'
            ? { kind: 'fundamentals', response: null }
            : { kind: 'price', response: null },
        )
        return
      }

      if (editor.kind === 'fundamentals') {
        const settle = (response: FundStateResponse | null) => {
          resolve({ kind: 'fundamentals', response })
        }
        fundStateResolveRef.current = settle
        iframeWindow.postMessage(
          { v: PM_VERSION, type: 'GET_FUND_STATE', payload: {} },
          '*',
        )
        setTimeout(() => {
          if (fundStateResolveRef.current === settle) {
            fundStateResolveRef.current = null
            settle(null)
          }
        }, READ_STATE_TIMEOUT_MS)
        return
      }

      const settle = (response: PriceStateResponse | null) => {
        resolve({ kind: 'price', response })
      }
      priceStateResolveRef.current = settle
      iframeWindow.postMessage(
        { v: PM_VERSION, type: 'GET_PRICE_STATE', payload: {} },
        '*',
      )
      setTimeout(() => {
        if (priceStateResolveRef.current === settle) {
          priceStateResolveRef.current = null
          settle(null)
        }
      }, READ_STATE_TIMEOUT_MS)
    })
  }, [editor.kind])

  async function handleSave(options?: { closeAfterSave?: boolean }) {
    const closeAfterSave = options?.closeAfterSave === true
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      const state = await requestState()

      let nextSpec: NewsletterChartSpec | null = null
      if (state.kind === 'fundamentals') {
        if (!state.response || !state.response.fundState) {
          throw new Error(
            'Could not read the chart state. Wait for the chart to finish loading and try again.',
          )
        }
        nextSpec = parseFundamentalsNewsletterChartSpecFromFundState(
          state.response.fundState,
          state.response.symbol,
          block.chartSpec as FundamentalsNewsletterChartSpec,
        )
        if (!nextSpec) {
          throw new Error(
            'Could not parse the chart. Make sure at least one metric is selected.',
          )
        }
      } else {
        if (!state.response || !state.response.priceState) {
          throw new Error(
            'Could not read the chart state. Wait for the chart to finish loading and try again.',
          )
        }
        nextSpec = parsePriceNewsletterChartSpecFromState(
          state.response.priceState,
          state.response.symbol,
          block.chartSpec as PriceNewsletterChartSpec,
        )
        if (!nextSpec) {
          throw new Error('Could not parse the price chart state.')
        }
      }

      const nextDraft: NewsletterDraftDocument = {
        ...draft,
        blocks: draft.blocks.map((entry) =>
          entry.id === block.id ? { ...entry, chartSpec: nextSpec! } : entry,
        ),
      }

      const response = await fetch(
        `/api/newsletter/drafts/${draftId}/regenerate-chart`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: block.id, draft: nextDraft }),
        },
      )

      const payload = (await response.json()) as {
        draft?: NewsletterDraftRecord
        error?: string
      }

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to save chart edits')
      }

      onSaved(payload.draft)
      if (closeAfterSave) {
        onClose()
      } else {
        setNotice('Chart saved and newsletter preview refreshed.')
      }
    } catch (err) {
      setNotice(null)
      setError(err instanceof Error ? err.message : 'Failed to save chart edits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-900">
            Edit chart — {block.heading || 'Untitled block'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Tweak the chart, then save to regenerate the newsletter image. Use
            Save and return to Editor to go back to the draft.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || status !== 'ready'}
            className="rounded-lg bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save chart'}
          </button>
          <button
            type="button"
            onClick={() => void handleSave({ closeAfterSave: true })}
            disabled={saving || status !== 'ready'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sage-200 bg-sage-50 px-3 py-1.5 text-xs font-semibold text-sage-800 transition hover:bg-sage-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.25 3.25 2.5 7l3.75 3.75" />
              <path d="M3 7h6.25c2.9 0 4.25-1.45 4.25-4.5" />
            </svg>
            {saving ? 'Saving…' : 'Save and return to Editor'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="border-b border-sage-200 bg-sage-50 px-6 py-2 text-xs text-sage-800">
          {notice}
        </div>
      ) : null}

      <div className="relative flex-1 bg-white">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="Newsletter chart editor"
          loading="eager"
          allow="fullscreen"
          onLoad={() => {
            // The embedded app can post READY before the browser fires the
            // iframe load event. Do not clobber the ready state in that case,
            // or "Save chart" stays disabled even though the editor is usable.
            if (editorReadyRef.current) return
            editorReadyRef.current = false
            setStatus('loading')
            setChartVisible(false)
          }}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-150 ${
            chartVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {!chartVisible ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            Loading chart editor…
          </div>
        ) : null}
      </div>
    </div>
  )
}
