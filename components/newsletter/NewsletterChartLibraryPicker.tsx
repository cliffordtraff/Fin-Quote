'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'

interface ChartLibraryResponse {
  charts?: NewsletterChartLibraryItem[]
  error?: string
}

interface DraftResponse {
  draft: NewsletterDraftRecord
  error?: string
}

interface NewsletterChartLibraryPickerProps {
  draftId: string
  draft: NewsletterDraftDocument
  block: NewsletterDraftBlock
  expectedUpdatedAt: string
  onClose: () => void
  onInserted: (record: NewsletterDraftRecord) => void
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

export default function NewsletterChartLibraryPicker({
  draftId,
  draft,
  block,
  expectedUpdatedAt,
  onClose,
  onInserted,
}: NewsletterChartLibraryPickerProps) {
  const [charts, setCharts] = useState<NewsletterChartLibraryItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingChartId, setSavingChartId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedChart = useMemo(
    () => charts.find((chart) => chart.chartImageUrl === block.chartImageUrl),
    [block.chartImageUrl, charts],
  )

  const visibleCharts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return charts
    return charts.filter(
      (chart) =>
        chart.title.toLowerCase().includes(normalizedQuery) ||
        chart.symbol.toLowerCase().includes(normalizedQuery),
    )
  }, [charts, query])

  useEffect(() => {
    let cancelled = false

    async function loadCharts() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/newsletter/charts', {
          credentials: 'include',
        })
        const payload = (await response.json()) as ChartLibraryResponse
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load chart library')
        }
        if (!cancelled) setCharts(payload.charts ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart library')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCharts()
    return () => {
      cancelled = true
    }
  }, [])

  async function insertChart(item: NewsletterChartLibraryItem) {
    try {
      setSavingChartId(item.id)
      setError(null)

      const nextDraft: NewsletterDraftDocument = {
        ...draft,
        blocks: draft.blocks.map((entry) =>
          entry.id === block.id
            ? {
                ...entry,
                chartImageUrl: item.chartImageUrl,
                chartAlt: item.title,
                chartExportUrl: item.chartExportUrl,
                chartSpec: item.chartSpec,
                chartNeedsRegeneration: false,
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
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to insert chart')
      }

      onInserted(payload.draft)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert chart')
    } finally {
      setSavingChartId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/45 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Chart library</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a saved chart for {block.heading || 'this section'}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f5] p-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && charts.length > 0 ? (
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

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Loading saved charts…
            </div>
          ) : charts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-base font-semibold text-gray-900">No saved charts yet</p>
              <p className="mt-2 text-sm text-gray-500">
                Open the charting app, build the chart, then use Save for Newsletter.
              </p>
            </div>
          ) : visibleCharts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No saved charts match this search.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visibleCharts.map((item) => {
                const isCurrent = selectedChart?.id === item.id
                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                      isCurrent ? 'border-sage-600 ring-2 ring-sage-600/15' : 'border-gray-200'
                    }`}
                  >
                    <div className="border-b border-gray-100 bg-white p-3">
                      <div className="relative aspect-[31/22] w-full overflow-hidden rounded-lg border border-gray-100">
                        <Image
                        src={item.thumbnailUrl}
                        alt={item.title}
                          fill
                          unoptimized
                          sizes="(min-width: 768px) 50vw, 100vw"
                          className="object-contain"
                        />
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
                        </div>
                        <button
                          type="button"
                          onClick={() => insertChart(item)}
                          disabled={savingChartId !== null}
                          className="ml-auto shrink-0 rounded-lg bg-sage-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingChartId === item.id ? 'Adding…' : isCurrent ? 'Use again' : 'Use chart'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
