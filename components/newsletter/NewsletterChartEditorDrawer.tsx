'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  parseFundamentalsNewsletterChartSpecFromFundState,
  resolveNewsletterChartEditor,
  resolveNewsletterPriceExportEditor,
} from '@/lib/newsletter/chart-editor'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  PriceChartExportSpec,
  PriceNewsletterChartSpec,
} from '@/lib/newsletter/types'

const PM_VERSION = 1
const READ_STATE_TIMEOUT_MS = 3000
const PRICE_EXPORT_STATE_TIMEOUT_MS = 1200
const EDITOR_READY_TIMEOUT_MS = 12_000

interface NewsletterChartEditorDrawerProps {
  draftId: string
  draft: NewsletterDraftDocument
  block: NewsletterDraftBlock
  expectedUpdatedAt: string
  openedEditSequence: number
  onClose: () => void
  onSaved: (
    record: NewsletterDraftRecord,
    openedEditSequence: number,
  ) => number | false | void
  onConflict: (
    latest: NewsletterDraftRecord,
    attemptedDraft: NewsletterDraftDocument,
    message: string,
  ) => void
}

interface FundStateResponse {
  fundState: Record<string, unknown> | null
  symbol: string
}

type StateResponse =
  | { kind: 'fundamentals'; response: FundStateResponse | null }
  | { kind: 'price-export'; spec: PriceChartExportSpec | null }

interface PendingFundStateRequest {
  resolve: (result: FundStateResponse | null) => void
  timeoutId: number
}

interface PriceExportSpecRequest {
  requestId: string
  resolve: (spec: PriceChartExportSpec | null) => void
  timeoutId: number
}

type EditorStatus = 'loading' | 'ready' | 'timed_out' | 'failed'

function resolveEditor(block: NewsletterDraftBlock) {
  if (isPriceNewsletterChartSpec(block.chartSpec)) {
    const spec = block.chartSpec as PriceNewsletterChartSpec
    const resolved = resolveNewsletterPriceExportEditor(spec)
    return {
      kind: 'price-export' as const,
      iframePath: resolved.iframePath,
      symbol: resolved.symbol,
      baseSpec: resolved.baseSpec,
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
  expectedUpdatedAt,
  openedEditSequence,
  onClose,
  onSaved,
  onConflict,
}: NewsletterChartEditorDrawerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const saveBaseRef = useRef({
    draft,
    block,
    expectedUpdatedAt,
  })
  const acknowledgedEditSequenceRef = useRef(openedEditSequence)
  const editorReadyRef = useRef(false)
  const savingRef = useRef(false)
  const fundStateRequestRef = useRef<PendingFundStateRequest | null>(null)
  const priceExportSpecRef = useRef<PriceChartExportSpec | null>(null)
  const priceExportSpecRequestRef = useRef<PriceExportSpecRequest | null>(null)
  const deferredEditorTimersRef = useRef<Set<number>>(new Set())

  const [status, setStatus] = useState<EditorStatus>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [chartVisible, setChartVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editor] = useState(() => resolveEditor(saveBaseRef.current.block))
  const iframeSrc = editor.iframePath

  const clearDeferredEditorTimers = useCallback(() => {
    for (const timerId of deferredEditorTimersRef.current) {
      window.clearTimeout(timerId)
    }
    deferredEditorTimersRef.current.clear()
  }, [])

  const scheduleEditorTimer = useCallback(
    (callback: () => void, delayMs: number) => {
      const timerId = window.setTimeout(() => {
        deferredEditorTimersRef.current.delete(timerId)
        callback()
      }, delayMs)
      deferredEditorTimersRef.current.add(timerId)
    },
    [],
  )

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow) return
      if (event.origin !== window.location.origin) return

      const data = event.data
      if (!data || typeof data !== 'object') return

      // New /export-editor protocol — used for price specs.
      if (editor.kind === 'price-export' && typeof data.type === 'string'
          && data.type.startsWith('export-editor:')) {
        if (data.type === 'export-editor:ready') {
          clearDeferredEditorTimers()
          editorReadyRef.current = true
          setStatus('ready')
          iframeWindow.postMessage(
            { type: 'export-editor:init', baseSpec: editor.baseSpec },
            '*',
          )
          // Seed the spec ref with the initial baseSpec so Save works even if
          // the user clicks Save before adjusting any control.
          priceExportSpecRef.current = editor.baseSpec
          scheduleEditorTimer(() => setChartVisible(true), 250)
          return
        }
        if (data.type === 'export-editor:spec-changed') {
          if (savingRef.current) return
          const spec = data.spec
          if (spec && typeof spec === 'object') {
            priceExportSpecRef.current = spec as PriceChartExportSpec
          }
          return
        }
        if (data.type === 'export-editor:spec') {
          const spec =
            data.spec && typeof data.spec === 'object'
              ? (data.spec as PriceChartExportSpec)
              : null
          if (spec) {
            priceExportSpecRef.current = spec
          }

          const pending = priceExportSpecRequestRef.current
          if (
            pending &&
            (typeof data.requestId !== 'string' ||
              data.requestId === pending.requestId)
          ) {
            window.clearTimeout(pending.timeoutId)
            priceExportSpecRequestRef.current = null
            pending.resolve(spec)
          }
          return
        }
        // 'export-editor:download-requested' could be wired to trigger Save,
        // but the drawer's top-bar Save button is the canonical path. Ignore
        // for now.
        return
      }

      // Legacy /tos newsletterEditor protocol — used for fundamentals specs.
      if (data.v !== PM_VERSION || typeof data.type !== 'string') return

      if (data.type === 'READY') {
        clearDeferredEditorTimers()
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
        }
        // Re-apply theme after the chart reload settles, since the chart may
        // re-initialize with its bootstrap theme and lose our first SET_THEME.
        scheduleEditorTimer(sendTheme, 800)
        scheduleEditorTimer(() => setChartVisible(true), 500)
        return
      }

      if (data.type === 'FUND_STATE') {
        const pending = fundStateRequestRef.current
        if (!pending) return
        window.clearTimeout(pending.timeoutId)
        fundStateRequestRef.current = null

        const payload = data.payload as Record<string, unknown> | undefined
        pending.resolve(
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
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [clearDeferredEditorTimers, editor, scheduleEditorTimer])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelButtonRef.current?.focus()
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), iframe[tabindex="0"], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'))

      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, saving])

  useEffect(() => {
    if (status !== 'loading') return

    const timeoutId = window.setTimeout(() => {
      if (editorReadyRef.current) return
      setStatus('timed_out')
      setChartVisible(false)
    }, EDITOR_READY_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [loadAttempt, status])

  useEffect(() => {
    return () => {
      clearDeferredEditorTimers()

      const pendingFundState = fundStateRequestRef.current
      if (pendingFundState) {
        window.clearTimeout(pendingFundState.timeoutId)
        fundStateRequestRef.current = null
      }

      const pendingPriceSpec = priceExportSpecRequestRef.current
      if (pendingPriceSpec) {
        window.clearTimeout(pendingPriceSpec.timeoutId)
        priceExportSpecRequestRef.current = null
      }
    }
  }, [clearDeferredEditorTimers])

  function retryEditor() {
    clearDeferredEditorTimers()
    editorReadyRef.current = false
    priceExportSpecRef.current = null
    setError(null)
    setNotice(null)
    setChartVisible(false)
    setStatus('loading')
    setLoadAttempt((current) => current + 1)
  }

  function markEditorLoadFailed() {
    if (editorReadyRef.current) return
    clearDeferredEditorTimers()
    setChartVisible(false)
    setStatus('failed')
  }

  const requestState = useCallback((): Promise<StateResponse> => {
    return new Promise((resolve) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || !editorReadyRef.current) {
        resolve(
          editor.kind === 'fundamentals'
            ? { kind: 'fundamentals', response: null }
            : { kind: 'price-export', spec: null },
        )
        return
      }

      if (editor.kind === 'fundamentals') {
        const settle = (response: FundStateResponse | null) => {
          resolve({ kind: 'fundamentals', response })
        }
        const timeoutId = window.setTimeout(() => {
          const pending = fundStateRequestRef.current
          if (pending?.resolve === settle) {
            fundStateRequestRef.current = null
            settle(null)
          }
        }, READ_STATE_TIMEOUT_MS)
        fundStateRequestRef.current = { resolve: settle, timeoutId }
        iframeWindow.postMessage(
          { v: PM_VERSION, type: 'GET_FUND_STATE', payload: {} },
          '*',
        )
        return
      }

      // Ask the iframe for a synchronous snapshot during Save. Slider edits
      // also push spec-changed events, but a user can click Save before the
      // preview debounce has flushed.
      const fallbackSpec = priceExportSpecRef.current
      const requestId = `price-export-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const settle = (spec: PriceChartExportSpec | null) => {
        resolve({ kind: 'price-export', spec: spec ?? fallbackSpec })
      }
      const timeoutId = window.setTimeout(() => {
        const pending = priceExportSpecRequestRef.current
        if (pending?.requestId === requestId) {
          priceExportSpecRequestRef.current = null
          settle(null)
        }
      }, PRICE_EXPORT_STATE_TIMEOUT_MS)
      priceExportSpecRequestRef.current = {
        requestId,
        resolve: settle,
        timeoutId,
      }
      iframeWindow.postMessage(
        { type: 'export-editor:get-spec', requestId },
        '*',
      )
    })
  }, [editor.kind])

  async function handleSave(options?: { closeAfterSave?: boolean }) {
    const closeAfterSave = options?.closeAfterSave === true
    const saveBase = saveBaseRef.current
    setError(null)
    setNotice(null)
    savingRef.current = true
    iframeRef.current?.blur()
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
          saveBase.block.chartSpec as FundamentalsNewsletterChartSpec,
        )
        if (!nextSpec) {
          throw new Error(
            'Could not parse the chart. Make sure at least one metric is selected.',
          )
        }
      } else {
        if (!state.spec) {
          throw new Error(
            'Could not read the chart state. Wait for the chart to finish loading and try again.',
          )
        }
        const existing = saveBase.block.chartSpec as PriceNewsletterChartSpec
        nextSpec = { ...existing, chartExportSpec: state.spec }
      }

      const nextDraft: NewsletterDraftDocument = {
        ...saveBase.draft,
        blocks: saveBase.draft.blocks.map((entry) =>
          entry.id === saveBase.block.id
            ? { ...entry, chartSpec: nextSpec! }
            : entry,
        ),
      }

      const response = await fetch(
        `/api/newsletter/drafts/${draftId}/regenerate-chart`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId: saveBase.block.id,
            draft: nextDraft,
            expectedUpdatedAt: saveBase.expectedUpdatedAt,
          }),
        },
      )

      const payload = (await response.json()) as {
        draft?: NewsletterDraftRecord
        error?: string
        latest?: NewsletterDraftRecord
      }

      if (response.status === 409 && payload.latest) {
        onConflict(
          payload.latest,
          nextDraft,
          payload.error ||
            'The server has a newer version. Your chart edits are preserved until you resolve the conflict.',
        )
        onClose()
        return
      }

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to save chart edits')
      }

      const savedRecord = payload.draft
      const savedBlock = savedRecord.draft.blocks.find(
        (entry) => entry.id === saveBase.block.id,
      )
      if (savedBlock) {
        saveBaseRef.current = {
          draft: savedRecord.draft,
          block: savedBlock,
          expectedUpdatedAt: savedRecord.updatedAt,
        }
      }

      const accepted = onSaved(
        savedRecord,
        acknowledgedEditSequenceRef.current,
      )
      if (accepted === false) return
      if (typeof accepted === 'number') {
        acknowledgedEditSequenceRef.current = accepted
      }
      if (closeAfterSave) {
        onClose()
      } else {
        setNotice('Chart saved and newsletter preview refreshed.')
      }
    } catch (err) {
      setNotice(null)
      setError(err instanceof Error ? err.message : 'Failed to save chart edits')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-chart-editor-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="min-w-0">
          <h2
            id="newsletter-chart-editor-title"
            className="truncate text-sm font-semibold text-gray-900"
          >
            Edit chart — {block.heading || 'Untitled block'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Tweak the chart, then save to regenerate the newsletter image. Use
            Save and return to Editor to go back to the draft.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            ref={cancelButtonRef}
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

      <div className="relative flex-1 bg-white" aria-busy={saving}>
        <iframe
          key={loadAttempt}
          ref={iframeRef}
          src={iframeSrc}
          title="Newsletter chart editor"
          loading="eager"
          allow="fullscreen"
          aria-hidden={!chartVisible}
          tabIndex={chartVisible && !saving ? 0 : -1}
          onLoad={() => {
            // The embedded app can post READY before the browser fires the
            // iframe load event. Do not clobber the ready state in that case,
            // or "Save chart" stays disabled even though the editor is usable.
            if (editorReadyRef.current) return
            editorReadyRef.current = false
            setStatus((current) =>
              current === 'timed_out' || current === 'failed'
                ? current
                : 'loading',
            )
            setChartVisible(false)
          }}
          onError={markEditorLoadFailed}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-150 ${
            chartVisible ? 'opacity-100' : 'opacity-0'
          } ${saving ? 'pointer-events-none' : ''}`}
        />
        {saving ? (
          <div
            role="status"
            aria-label="Saving chart and pausing editor"
            aria-live="polite"
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-medium text-gray-700 backdrop-blur-[1px]"
          >
            Saving chart… The editor is paused until this request finishes.
          </div>
        ) : null}
        {!chartVisible && (status === 'timed_out' || status === 'failed') ? (
          <div
            role="alert"
            aria-live="assertive"
            className="absolute inset-0 flex items-center justify-center bg-white px-6"
          >
            <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
              <h3 className="text-base font-semibold text-gray-950">
                {status === 'timed_out'
                  ? 'Chart editor is taking too long to load'
                  : 'Chart editor could not be loaded'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Your newsletter is unchanged. Retry this embedded editor, or
                open the chart editor directly in a new tab to recover your work.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={retryEditor}
                  className="rounded-lg bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
                >
                  Retry editor
                </button>
                <a
                  href={iframeSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
                >
                  Open editor in new tab
                </a>
              </div>
            </div>
          </div>
        ) : !chartVisible ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center text-sm text-gray-500"
          >
            {status === 'ready'
              ? 'Preparing chart editor…'
              : 'Loading chart editor…'}
          </div>
        ) : null}
      </div>
    </div>
  )
}
