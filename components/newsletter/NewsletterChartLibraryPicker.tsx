'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'
import type {
  NewsletterChartLibraryItem,
  NewsletterChartLibraryPage,
  NewsletterChartLibrarySummary,
} from '@/lib/newsletter/chart-library'

interface ChartLibraryPageResponse extends Partial<NewsletterChartLibraryPage> {
  error?: string
}

interface ChartLibraryItemResponse {
  chart?: NewsletterChartLibraryItem
  error?: string
}

interface DraftResponse {
  draft?: NewsletterDraftRecord
  error?: string
  latest?: NewsletterDraftRecord
}

interface NewsletterChartLibraryPickerProps {
  draftId: string
  draft: NewsletterDraftDocument
  block: NewsletterDraftBlock
  expectedUpdatedAt: string
  onClose: () => void
  getEditSequence: () => number
  onInserted: (
    record: NewsletterDraftRecord,
    submittedEditSequence: number,
  ) => void
  onConflict: (
    latest: NewsletterDraftRecord,
    attemptedDraft: NewsletterDraftDocument,
    message: string,
  ) => void
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type ChartPreviewStatus = 'loading' | 'loaded' | 'failed'

interface ChartLibraryCardProps {
  item: NewsletterChartLibrarySummary
  isCurrent: boolean
  disabled: boolean
  saving: boolean
  onInsert: (item: NewsletterChartLibrarySummary) => Promise<void>
}

const CHART_LIBRARY_PICKER_PAGE_SIZE = 12

function buildSummaryUrl(query: string, cursor?: string | null): string {
  const params = new URLSearchParams({
    limit: String(CHART_LIBRARY_PICKER_PAGE_SIZE),
  })
  const normalizedQuery = query.trim()
  if (normalizedQuery) params.set('q', normalizedQuery)
  if (cursor) params.set('cursor', cursor)
  return `/api/newsletter/charts/summaries?${params.toString()}`
}

function isFullChartLibraryItem(
  item: NewsletterChartLibrarySummary,
): item is NewsletterChartLibrarySummary & NewsletterChartLibraryItem {
  return 'chartSpec' in item &&
    typeof item.chartSpec === 'object' &&
    item.chartSpec !== null &&
    'capturedAt' in item &&
    typeof item.capturedAt === 'string'
}

function ChartLibraryCard({
  item,
  isCurrent,
  disabled,
  saving,
  onInsert,
}: ChartLibraryCardProps) {
  const [previewStatus, setPreviewStatus] = useState<ChartPreviewStatus>(() =>
    item.thumbnailUrl ? 'loading' : 'failed',
  )
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const openChartUrl = item.chartExportUrl || item.chartImageUrl

  useEffect(() => {
    setPreviewStatus(item.thumbnailUrl ? 'loading' : 'failed')
    setPreviewAttempt(0)
  }, [item.thumbnailUrl])

  function retryPreview() {
    setPreviewStatus('loading')
    setPreviewAttempt((current) => current + 1)
  }

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        isCurrent
          ? 'border-sage-600 ring-2 ring-sage-600/15'
          : 'border-gray-200'
      }`}
    >
      <div className="border-b border-gray-100 bg-white p-3">
        <div
          aria-busy={previewStatus === 'loading'}
          className="relative aspect-[31/22] w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
        >
          {previewStatus !== 'failed' && item.thumbnailUrl ? (
            <Image
              key={`${item.thumbnailUrl}:${previewAttempt}`}
              src={item.thumbnailUrl}
              alt={item.title}
              fill
              unoptimized
              loading="lazy"
              sizes="(min-width: 768px) 50vw, 100vw"
              onLoad={() => setPreviewStatus('loaded')}
              onError={() => setPreviewStatus('failed')}
              className={`object-contain transition-opacity ${
                previewStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : null}

          {previewStatus === 'loading' ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-medium text-gray-500"
            >
              Loading preview for {item.title}…
            </div>
          ) : previewStatus === 'failed' ? (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
            >
              <p className="text-sm font-semibold text-gray-800">
                Preview unavailable
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                The saved image could not be loaded. You can still open the
                exact chart below.
              </p>
              {item.thumbnailUrl ? (
                <button
                  type="button"
                  onClick={retryPreview}
                  className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
                >
                  Retry preview
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-950">
              {item.title}
            </h3>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
              {item.symbol}
              {formatUpdatedAt(item.updatedAt)
                ? ` · ${formatUpdatedAt(item.updatedAt)}`
                : ''}
            </p>
            {openChartUrl ? (
              <a
                href={openChartUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${item.title}`}
                className="mt-2 inline-flex text-xs font-semibold text-sage-700 hover:text-sage-900"
              >
                Open chart
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void onInsert(item)}
            disabled={disabled}
            className="ml-auto shrink-0 rounded-lg bg-sage-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Adding…' : isCurrent ? 'Use again' : 'Use chart'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function NewsletterChartLibraryPicker({
  draftId,
  draft,
  block,
  expectedUpdatedAt,
  onClose,
  getEditSequence,
  onInserted,
  onConflict,
}: NewsletterChartLibraryPickerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [charts, setCharts] = useState<NewsletterChartLibrarySummary[]>([])
  const [query, setQuery] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasLibraryItems, setHasLibraryItems] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [savingChartId, setSavingChartId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadSequence, setReloadSequence] = useState(0)
  const activeRequestRef = useRef<AbortController | null>(null)
  const requestSequenceRef = useRef(0)

  const selectedChart = useMemo(
    () => charts.find((chart) => chart.chartImageUrl === block.chartImageUrl),
    [block.chartImageUrl, charts],
  )

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current
    const controller = new AbortController()
    activeRequestRef.current?.abort()
    activeRequestRef.current = controller
    setCharts([])
    setNextCursor(null)
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setLoadError(null)

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(buildSummaryUrl(query), {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = (await response.json()) as ChartLibraryPageResponse
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load chart library')
        }
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
        const nextCharts = payload.charts ?? []
        setCharts(nextCharts)
        setNextCursor(payload.nextCursor ?? null)
        if (!query.trim()) {
          setHasLibraryItems(
            typeof payload.total === 'number'
              ? payload.total > 0
              : nextCharts.length > 0,
          )
        }
      } catch (err) {
        if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load chart library',
        )
      } finally {
        if (!controller.signal.aborted && requestSequence === requestSequenceRef.current) {
          setLoading(false)
        }
      }
    }, 200)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
      activeRequestRef.current?.abort()
    }
  }, [query, reloadSequence])

  function retryLoad() {
    setReloadSequence((current) => current + 1)
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    const requestSequence = ++requestSequenceRef.current
    const controller = new AbortController()
    activeRequestRef.current?.abort()
    activeRequestRef.current = controller
    try {
      setLoadingMore(true)
      setError(null)
      const response = await fetch(buildSummaryUrl(query, nextCursor), {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = (await response.json()) as ChartLibraryPageResponse
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load more charts')
      }
      if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
      setCharts((current) => {
        const seen = new Set(current.map((chart) => chart.id))
        return current.concat(
          (payload.charts ?? []).filter((chart) => !seen.has(chart.id)),
        )
      })
      setNextCursor(payload.nextCursor ?? null)
    } catch (err) {
      if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load more charts')
    } finally {
      if (!controller.signal.aborted && requestSequence === requestSequenceRef.current) {
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && savingChartId === null) {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
  }, [onClose, savingChartId])

  async function insertChart(summary: NewsletterChartLibrarySummary) {
    const submittedEditSequence = getEditSequence()
    try {
      setSavingChartId(summary.id)
      setError(null)

      let item: NewsletterChartLibraryItem
      if (isFullChartLibraryItem(summary)) {
        // Backward-compatible with an old server during a rolling deploy.
        item = summary
      } else {
        const detailResponse = await fetch(
          `/api/newsletter/charts/${encodeURIComponent(summary.id)}`,
          {
            credentials: 'include',
            cache: 'no-store',
          },
        )
        const detailPayload = (await detailResponse.json()) as ChartLibraryItemResponse
        if (!detailResponse.ok || !detailPayload.chart) {
          throw new Error(detailPayload.error || 'Failed to load the selected chart')
        }
        item = detailPayload.chart
      }

      const nextDraft: NewsletterDraftDocument = {
        ...draft,
        blocks: draft.blocks.map((entry) =>
          entry.id === block.id
            ? {
                ...entry,
                heading:
                  entry.heading.trim() === entry.chartAlt.trim()
                    ? item.title
                    : entry.heading,
                chartImageUrl: item.chartImageUrl,
                chartAlt: item.title,
                chartExportUrl: item.chartExportUrl,
                chartSpec: item.chartSpec,
                chartProvenance: {
                  version: 1,
                  source: 'chart_library',
                  libraryItemId: item.id,
                  capturedAt: item.capturedAt,
                  rendererContract: item.rendererContract,
                  imageUrl: item.chartImageUrl,
                  imageSha256: item.imageSha256,
                  interactiveUrl: item.chartExportUrl,
                  scene: item.chartSpec,
                  sceneSha256: item.sceneHash,
                },
                chartNeedsRegeneration: false,
                caption: `Saved chart: ${item.title}.`,
              }
            : entry,
        ),
      }

      const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draft: nextDraft,
          expectedUpdatedAt,
        }),
      })
      const payload = (await response.json()) as DraftResponse

      if (response.status === 409 && payload.latest) {
        onConflict(
          payload.latest,
          nextDraft,
          payload.error ||
            'The server has a newer version. Your chart selection is preserved until you resolve the conflict.',
        )
        onClose()
        return
      }

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to insert chart')
      }

      onInserted(payload.draft, submittedEditSequence)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert chart')
    } finally {
      setSavingChartId(null)
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-chart-library-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-gray-950/45 p-4 backdrop-blur-sm"
    >
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2
              id="newsletter-chart-library-title"
              className="text-lg font-semibold text-gray-950"
            >
              Chart library
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a saved chart for {block.heading || 'this section'}.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={savingChartId !== null}
            className="ml-auto rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f5] p-5">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          {hasLibraryItems !== false ? (
            <label className="mb-4 block">
              <span className="sr-only">Search saved charts</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or symbol"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              />
            </label>
          ) : null}

          {loadError ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-white p-8 text-center"
            >
              <p className="text-base font-semibold text-gray-900">
                Couldn’t load saved charts
              </p>
              <p className="mt-2 text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-4 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 transition hover:bg-red-50"
              >
                Retry loading charts
              </button>
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Loading saved charts…
            </div>
          ) : hasLibraryItems === false ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-base font-semibold text-gray-900">No saved charts yet</p>
              <p className="mt-2 text-sm text-gray-500">
                Open the charting app, build the chart, then use Save for Newsletter.
              </p>
            </div>
          ) : charts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              <p>No saved charts match this search.</p>
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
              {charts.map((item) => {
                const isCurrent = selectedChart?.id === item.id
                return (
                  <div
                    key={item.id}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '390px' }}
                  >
                    <ChartLibraryCard
                      item={item}
                      isCurrent={isCurrent}
                      disabled={savingChartId !== null}
                      saving={savingChartId === item.id}
                      onInsert={insertChart}
                    />
                  </div>
                )
              })}
              </div>
              {nextCursor ? (
                <div className="mt-5 flex justify-center border-t border-gray-200 pt-5">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore || savingChartId !== null}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading more…' : 'Load more charts'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
