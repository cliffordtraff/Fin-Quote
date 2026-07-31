'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  refreshWhyMovedCatalystAction,
  saveWhyMovedReviewAction,
} from '@/app/actions/why-moved-review'
import type {
  WhyMovedQueueItem,
  WhyMovedReviewStatus,
} from '@/lib/why-moved-types'

const REVIEW_STATUSES: Array<{
  id: WhyMovedReviewStatus
  label: string
}> = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'needs_work', label: 'Needs work' },
  { id: 'dismissed', label: 'Dismissed' },
]

function statusClass(status: WhyMovedReviewStatus): string {
  if (status === 'approved') return 'bg-green-100 text-green-800'
  if (status === 'needs_work') return 'bg-amber-100 text-amber-900'
  if (status === 'dismissed') return 'bg-gray-200 text-gray-700'
  return 'bg-blue-100 text-blue-800'
}

function formatFetchedAt(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface WhyMovedReviewQueueProps {
  initialItems: WhyMovedQueueItem[]
  marketDate: string
}

export default function WhyMovedReviewQueue({
  initialItems,
  marketDate,
}: WhyMovedReviewQueueProps) {
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<WhyMovedReviewStatus | 'all'>('pending')
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>(
    Object.fromEntries(
      initialItems.map((item) => [item.reviewKey, item.review?.notes ?? '']),
    ),
  )
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const counts = useMemo(() => {
    const next: Record<WhyMovedReviewStatus | 'all', number> = {
      all: items.length,
      pending: 0,
      approved: 0,
      needs_work: 0,
      dismissed: 0,
    }
    for (const item of items) next[item.reviewStatus] += 1
    return next
  }, [items])

  const visibleItems = useMemo(
    () =>
      filter === 'all'
        ? items
        : items.filter((item) => item.reviewStatus === filter),
    [filter, items],
  )

  async function saveReview(
    item: WhyMovedQueueItem,
    status: WhyMovedReviewStatus,
  ) {
    try {
      setSavingKey(item.reviewKey)
      setError(null)
      setNotice(null)
      const result = await saveWhyMovedReviewAction({
        candidate: {
          reviewKey: item.reviewKey,
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changesPercentage: item.changesPercentage,
          direction: item.direction,
          session: item.session,
          marketDate: item.marketDate,
        },
        status,
        notes: notesByKey[item.reviewKey] ?? '',
      })
      if (!result.success || !result.review) {
        throw new Error(result.error || 'Failed to save catalyst review')
      }
      setItems((current) =>
        current.map((entry) =>
          entry.reviewKey === item.reviewKey
            ? {
                ...entry,
                review: result.review ?? null,
                reviewStatus: result.review?.status ?? status,
                newsletterDraft: result.newsletterDraft
                  ? {
                      id: result.newsletterDraft.id,
                      status: result.newsletterDraft.status,
                      subjectLine: result.newsletterDraft.subjectLine,
                      chartsAttached: result.newsletterDraft.chartsAttached,
                      beehiivUrl: result.newsletterDraft.beehiivUrl,
                    }
                  : entry.newsletterDraft,
              }
            : entry,
        ),
      )
      if (result.automationError) {
        setError(
          `${item.symbol} was approved, but draft automation needs a retry: ${result.automationError}`,
        )
      } else if (result.newsletterDraft) {
        const chartMessage =
          result.newsletterDraft.chartsAttached === 1
            ? '1 chart attached'
            : `${result.newsletterDraft.chartsAttached} charts attached`
        setNotice(
          result.newsletterDraft.warning
            ? `${item.symbol} draft created; ${result.newsletterDraft.warning}`
            : `${item.symbol} draft ${result.newsletterDraft.created ? 'created' : 'ready'} with ${chartMessage}.`,
        )
      } else {
        setNotice(`${item.symbol} review saved.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save catalyst review')
    } finally {
      setSavingKey(null)
    }
  }

  async function refreshCatalyst(item: WhyMovedQueueItem) {
    try {
      setRefreshingKey(item.reviewKey)
      setError(null)
      setNotice(null)
      const result = await refreshWhyMovedCatalystAction(item.symbol)
      if (!result.success || !result.whyMoving) {
        throw new Error(result.error || 'Failed to refresh catalyst')
      }
      setItems((current) =>
        current.map((entry) =>
          entry.reviewKey === item.reviewKey
            ? { ...entry, whyMoving: result.whyMoving }
            : entry,
        ),
      )
      setNotice(`${item.symbol} catalyst refreshed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh catalyst')
    } finally {
      setRefreshingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <section className="border-y border-gray-200 bg-white">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Market date', value: marketDate },
            { label: 'Candidates', value: counts.all },
            { label: 'Pending', value: counts.pending },
            { label: 'Approved', value: counts.approved },
            { label: 'Needs work', value: counts.needs_work },
          ].map((summary, index) => (
            <div
              key={summary.label}
              className={`px-4 py-3 ${
                index > 0 ? 'border-t border-gray-200 sm:border-l sm:border-t-0' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                {summary.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-950">
                {summary.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800">
          {notice}
        </div>
      ) : null}

      <div
        className="flex max-w-full overflow-x-auto border-b border-gray-200"
        role="tablist"
        aria-label="Filter catalyst reviews"
      >
        {[{ id: 'all' as const, label: 'All' }, ...REVIEW_STATUSES].map(
          (status) => (
            <button
              key={status.id}
              type="button"
              role="tab"
              aria-selected={filter === status.id}
              onClick={() => setFilter(status.id)}
              className={`shrink-0 border-b-2 px-4 py-2 text-xs font-semibold transition ${
                filter === status.id
                  ? 'border-sage-700 text-sage-800'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {status.label} {counts[status.id]}
            </button>
          ),
        )}
      </div>

      <section className="overflow-hidden border border-gray-200 bg-white">
        {visibleItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No catalyst candidates in this review state.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {visibleItems.map((item) => (
              <article
                key={item.reviewKey}
                className="grid gap-4 px-4 py-4 lg:grid-cols-[180px_minmax(0,1fr)_360px]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/stock/${encodeURIComponent(item.symbol)}`}
                      className="text-base font-bold text-sage-700 hover:text-sage-900"
                    >
                      {item.symbol}
                    </Link>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClass(
                        item.reviewStatus,
                      )}`}
                    >
                      {REVIEW_STATUSES.find(
                        (status) => status.id === item.reviewStatus,
                      )?.label ?? item.reviewStatus}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{item.name}</p>
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      item.direction === 'gainer' ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {item.changesPercentage >= 0 ? '+' : ''}
                    {item.changesPercentage.toFixed(2)}% · ${item.price.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-gray-400">
                    {item.session.replace('cash', 'regular')} · {item.direction}
                  </p>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                        item.whyMoving.status === 'found'
                          ? 'bg-sage-100 text-sage-800'
                          : item.whyMoving.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {item.whyMoving.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      Fetched {formatFetchedAt(item.whyMoving.fetchedAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 text-sm font-semibold leading-6 text-gray-950">
                    {item.whyMoving.headline ??
                      item.whyMoving.displayText ??
                      'No specific catalyst found'}
                  </h2>
                  {item.whyMoving.summary &&
                  item.whyMoving.summary !== item.whyMoving.headline ? (
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      {item.whyMoving.summary}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.whyMoving.sourceUrl ? (
                      <a
                        href={item.whyMoving.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-sage-700 hover:text-sage-900"
                      >
                        Open source
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void refreshCatalyst(item)}
                      disabled={refreshingKey === item.reviewKey}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-950 disabled:opacity-50"
                    >
                      {refreshingKey === item.reviewKey
                        ? 'Refreshing...'
                        : 'Refresh catalyst'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      Reviewer notes
                    </span>
                    <textarea
                      value={notesByKey[item.reviewKey] ?? ''}
                      onChange={(event) =>
                        setNotesByKey((current) => ({
                          ...current,
                          [item.reviewKey]: event.target.value,
                        }))
                      }
                      maxLength={1000}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                    {REVIEW_STATUSES.map((status) => (
                      <button
                        key={status.id}
                        type="button"
                        onClick={() => void saveReview(item, status.id)}
                        disabled={savingKey === item.reviewKey}
                        className={`min-h-8 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          item.reviewStatus === status.id
                            ? 'border-sage-700 bg-sage-700 text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-sage-400 hover:text-sage-900'
                        }`}
                      >
                        {savingKey === item.reviewKey
                          ? status.id === 'approved'
                            ? 'Building draft...'
                            : 'Saving...'
                          : status.id === 'approved'
                            ? 'Approve + draft'
                            : status.label}
                      </button>
                    ))}
                  </div>
                  {item.newsletterDraft ? (
                    <Link
                      href={`/newsletter/editor/${item.newsletterDraft.id}`}
                      className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-sage-300 bg-sage-50 px-3 py-2 text-xs font-semibold text-sage-900 transition hover:border-sage-500 hover:bg-sage-100"
                    >
                      <span className="truncate">Open automated draft</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-sage-700">
                        {item.newsletterDraft.status} ·{' '}
                        {item.newsletterDraft.chartsAttached}{' '}
                        {item.newsletterDraft.chartsAttached === 1
                          ? 'chart'
                          : 'charts'}
                      </span>
                    </Link>
                  ) : item.reviewStatus === 'approved' ? (
                    <p className="text-xs leading-5 text-amber-700">
                      Select Approve + draft again to retry automation.
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
