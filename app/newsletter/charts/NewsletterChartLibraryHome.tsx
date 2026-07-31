'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import type { PriceNewsletterChartSpec } from '@/lib/newsletter/types'

interface NewsletterChartLibraryItem {
  id: string
  title: string
  symbol: string
  chartSpec: PriceNewsletterChartSpec
  chartImageUrl: string
  thumbnailUrl: string
  chartExportUrl: string
  createdAt: string
  updatedAt: string
}

interface ChartLibraryResponse {
  charts?: NewsletterChartLibraryItem[]
  chart?: NewsletterChartLibraryItem
  error?: string
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function chartDetails(item: NewsletterChartLibraryItem): string {
  const spec = item.chartSpec
  return [
    spec.range,
    spec.interval,
    spec.chartType.replace('-', ' '),
  ].filter(Boolean).join(' · ')
}

interface NewsletterChartLibraryHomeProps {
  chartBuilderUrl: string
}

export default function NewsletterChartLibraryHome({
  chartBuilderUrl,
}: NewsletterChartLibraryHomeProps) {
  const [charts, setCharts] = useState<NewsletterChartLibraryItem[]>([])
  const [query, setQuery] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<NewsletterChartLibraryItem | null>(null)

  const symbols = useMemo(
    () => Array.from(new Set(charts.map((chart) => chart.symbol))).sort(),
    [charts],
  )

  const visibleCharts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return charts.filter((chart) => {
      if (symbolFilter !== 'all' && chart.symbol !== symbolFilter) return false
      if (!normalizedQuery) return true
      return (
        chart.title.toLowerCase().includes(normalizedQuery) ||
        chart.symbol.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [charts, query, symbolFilter])

  async function loadCharts() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/newsletter/charts', {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = (await response.json()) as ChartLibraryResponse
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load chart library')
      }
      setCharts(payload.charts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart library')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCharts()
  }, [])

  useEffect(() => {
    if (!pendingDelete) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletingId) setPendingDelete(null)
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingDelete, deletingId])

  async function deleteChart(item: NewsletterChartLibraryItem) {
    try {
      setDeletingId(item.id)
      setError(null)
      setNotice(null)
      const response = await fetch(`/api/newsletter/charts/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete chart')
      }
      setCharts((current) => current.filter((chart) => chart.id !== item.id))
      setNotice('Chart deleted.')
      setPendingDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chart')
    } finally {
      setDeletingId((current) => (current === item.id ? null : current))
    }
  }

  function beginRename(item: NewsletterChartLibraryItem) {
    setEditingId(item.id)
    setEditingTitle(item.title)
    setError(null)
    setNotice(null)
  }

  async function saveTitle(item: NewsletterChartLibraryItem) {
    try {
      setSavingTitle(true)
      setError(null)
      setNotice(null)
      const response = await fetch(`/api/newsletter/charts/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: editingTitle }),
      })
      const payload = (await response.json()) as ChartLibraryResponse
      if (!response.ok || !payload.chart) {
        throw new Error(payload.error || 'Failed to rename chart')
      }
      setCharts((current) =>
        current.map((chart) =>
          chart.id === payload.chart?.id ? payload.chart : chart,
        ),
      )
      setEditingId(null)
      setEditingTitle('')
      setNotice('Chart renamed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename chart')
    } finally {
      setSavingTitle(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700">
              Newsletter
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">
              Chart library
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Saved chart images and editable chart specs for newsletter blocks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/newsletter/editor"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
            >
              Drafts
            </Link>
            <a
              href={chartBuilderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
            >
              Build chart
            </a>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800">
            {notice}
          </div>
        ) : null}

        {!loading && charts.length > 0 ? (
          <div className="mt-4 grid gap-3 border-b border-gray-200 pb-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="block">
              <span className="sr-only">Search saved charts</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or symbol"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              />
            </label>
            <label className="block">
              <span className="sr-only">Filter by symbol</span>
              <select
                value={symbolFilter}
                onChange={(event) => setSymbolFilter(event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              >
                <option value="all">All symbols</option>
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading charts…</div>
        ) : charts.length === 0 ? (
          <div className="py-10">
            <div className="rounded-2xl border border-dashed border-gray-300 bg-cream-100 p-8 text-center">
              <p className="text-base font-semibold text-gray-900">No saved charts yet</p>
              <p className="mt-2 text-sm text-gray-500">
                Build a chart in the Charting Platform, then click Save for Newsletter.
              </p>
            </div>
          </div>
        ) : visibleCharts.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No saved charts match this filter.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCharts.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <a
                  href={item.chartImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-b border-gray-100 bg-cream-100 p-3"
                >
                  <div className="relative aspect-[31/22] w-full overflow-hidden rounded-lg border border-gray-100 bg-white">
                    <Image
                    src={item.thumbnailUrl}
                    alt={item.title}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw"
                      className="object-contain"
                    />
                  </div>
                </a>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sage-700 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                          {item.symbol}
                        </span>
                        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
                          {chartDetails(item)}
                        </span>
                      </div>
                      {editingId === item.id ? (
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void saveTitle(item)
                          }}
                        >
                          <input
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            maxLength={120}
                            autoFocus
                            aria-label="Chart title"
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          />
                          <button
                            type="submit"
                            disabled={savingTitle || !editingTitle.trim()}
                            className="rounded-lg bg-sage-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <h2 className="mt-2 truncate text-base font-semibold text-gray-950">
                          {item.title}
                        </h2>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Saved {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={item.chartImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
                    >
                      Open image
                    </a>
                    <a
                      href={item.chartExportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
                    >
                      Open chart
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        editingId === item.id
                          ? setEditingId(null)
                          : beginRename(item)
                      }
                      disabled={savingTitle}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {editingId === item.id ? 'Cancel' : 'Rename'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      disabled={deletingId === item.id}
                      className="ml-auto inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!deletingId) setPendingDelete(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chart-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
              Delete chart
            </p>
            <h3 id="delete-chart-title" className="mt-2 text-xl font-semibold text-gray-900">
              Remove this saved chart?
            </h3>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              Delete <span className="font-semibold text-gray-900">“{pendingDelete.title}”</span>?
              This removes it from the chart library.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteChart(pendingDelete)}
                disabled={Boolean(deletingId)}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === pendingDelete.id ? 'Deleting…' : 'Delete chart'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
