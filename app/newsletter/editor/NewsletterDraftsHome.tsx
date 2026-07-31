'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type {
  NewsletterDraftStatus,
  NewsletterDraftSummary,
} from '@/lib/newsletter/types'
import {
  getNewsletterWorkflowStage,
  NEWSLETTER_WORKFLOW_STAGES,
} from '@/lib/newsletter/workflow'

interface DraftListResponse {
  drafts: NewsletterDraftSummary[]
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateTimeParts(value: string) {
  const formatted = formatDateTime(value)
  const match = formatted.match(/^(.*\d{1,2}:\d{2})\s(AM|PM)$/)
  if (!match) {
    return { main: formatted, meridiem: null as string | null }
  }
  return {
    main: match[1],
    meridiem: match[2],
  }
}

export default function NewsletterDraftsHome() {
  const [drafts, setDrafts] = useState<NewsletterDraftSummary[]>([])
  const [statusFilter, setStatusFilter] = useState<
    NewsletterDraftStatus | 'all'
  >('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    subjectLine: string
  } | null>(null)

  const visibleDrafts = useMemo(
    () =>
      statusFilter === 'all'
        ? drafts
        : drafts.filter((draft) => draft.status === statusFilter),
    [drafts, statusFilter],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<NewsletterDraftStatus | 'all', number> = {
      all: drafts.length,
      draft: 0,
      review: 0,
      ready: 0,
      published: 0,
    }
    for (const draft of drafts) {
      counts[draft.status] += 1
    }
    return counts
  }, [drafts])

  useEffect(() => {
    let cancelled = false

    async function loadDrafts() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/newsletter/drafts', {
          credentials: 'include',
          cache: 'no-store',
        })

        const payload = (await response.json()) as DraftListResponse & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load newsletter drafts')
        }

        if (!cancelled) {
          setDrafts(payload.drafts)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load newsletter drafts')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDrafts()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pendingDelete) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletingDraftId) {
        setPendingDelete(null)
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pendingDelete, deletingDraftId])

  async function deleteDraft(draftId: string) {
    let deleted = false

    try {
      setDeletingDraftId(draftId)
      setError(null)
      setNotice(null)

      const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete newsletter draft')
      }

      setDrafts((current) => current.filter((draft) => draft.id !== draftId))
      setNotice('Draft deleted.')
      deleted = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete newsletter draft')
    } finally {
      setDeletingDraftId((current) => (current === draftId ? null : current))
      if (deleted) {
        setPendingDelete((current) => (current?.id === draftId ? null : current))
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Newsletter History
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Follow every issue from catalyst approval through its Beehiiv
              publication record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/newsletter/morning-review"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              Morning queue
            </Link>
            <Link
              href="/newsletter/charts"
              className="inline-flex items-center justify-center rounded-xl border border-sage-700 px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
            >
              Chart library
            </Link>
            <Link
              href="/newsletter/editor/new"
              className="inline-flex items-center justify-center rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
            >
              New draft
            </Link>
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

        <div
          className="mt-4 flex max-w-full overflow-x-auto border-b border-gray-200"
          role="tablist"
          aria-label="Filter drafts by publishing stage"
        >
          {[
            { id: 'all' as const, label: 'All' },
            ...NEWSLETTER_WORKFLOW_STAGES.map((stage) => ({
              id: stage.id,
              label: stage.shortLabel,
            })),
          ].map((filter) => {
            const selected = statusFilter === filter.id
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setStatusFilter(filter.id)}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                  selected
                    ? 'border-sage-700 text-sage-800'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {filter.label} {statusCounts[filter.id]}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading drafts…</div>
        ) : drafts.length === 0 ? (
          <div className="py-10 text-sm text-gray-500">
            No drafts yet. Create one to start editing.
          </div>
        ) : visibleDrafts.length === 0 ? (
          <div className="py-10 text-sm text-gray-500">
            No drafts in this publishing stage.
          </div>
        ) : (
          <div className="mt-4 grid gap-1.5">
            {visibleDrafts.map((draft) => {
              const generatedAt = formatDateTimeParts(draft.generatedAt)
              const updatedAt = formatDateTimeParts(draft.updatedAt)
              const workflowStage = getNewsletterWorkflowStage(draft.status)

              return (
                <div
                  key={draft.id}
                  className="rounded-2xl border border-gray-200 bg-cream-100 px-4 py-2.5 transition hover:border-sage-400 hover:bg-sage-50 sm:px-5"
                >
                  <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:items-center lg:gap-5">
                    <Link
                      href={`/newsletter/editor/${draft.id}`}
                      className="min-w-0 flex-1 rounded-xl outline-none transition hover:text-sage-900 focus-visible:ring-2 focus-visible:ring-sage-500/30"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex rounded-full bg-sage-700 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                            {draft.format === 'market_roundup'
                              ? 'Roundup'
                              : draft.ticker === 'TBD'
                                ? 'Blank'
                                : draft.ticker}
                          </span>
                          {draft.format === 'market_roundup' && draft.featuredTickers.length > 0 ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                              {draft.featuredTickers.join(', ')}
                            </span>
                          ) : null}
                          <span className="inline-flex rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                            {workflowStage.label}
                          </span>
                          <span
                            className={`inline-flex px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              draft.sourceType === 'catalyst'
                                ? 'bg-green-100 text-green-800'
                                : draft.sourceType === 'daily_batch'
                                  ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {draft.sourceType}
                          </span>
                        </div>
                        <h3 className="mt-1.5 max-w-3xl text-[15px] font-semibold leading-5 text-gray-900 sm:text-base">
                          {draft.subjectLine}
                        </h3>
                      </div>
                    </Link>

                    <div className="flex shrink-0 flex-col gap-1.5 lg:w-[248px] lg:items-end">
                      <div className="flex flex-wrap justify-end gap-2">
                        {draft.beehiivUrl ? (
                          <a
                            href={draft.beehiivUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center border border-sage-300 bg-white px-3 py-0.5 text-[11px] font-semibold text-sage-800 transition hover:border-sage-500 hover:bg-sage-50"
                          >
                            Published issue
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({
                              id: draft.id,
                              subjectLine: draft.subjectLine,
                            })
                          }
                          disabled={deletingDraftId === draft.id}
                          className="inline-flex items-center justify-center border border-red-200 bg-white px-3 py-0.5 text-[11px] font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingDraftId === draft.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>

                      <div className="grid gap-0 text-[11px] leading-4 text-gray-600 lg:text-right">
                        <span>
                          {draft.attachedChartCount}{' '}
                          {draft.attachedChartCount === 1 ? 'chart' : 'charts'}
                          {draft.sourceType === 'catalyst' ||
                          draft.sourceType === 'daily_batch'
                            ? ' attached'
                            : ''}
                        </span>
                        {draft.publishedAt ? (
                          <span>
                            Published {formatDateTime(draft.publishedAt)}
                          </span>
                        ) : null}
                        <span>
                          Generated {generatedAt.main}
                          {generatedAt.meridiem ? (
                            <span className="whitespace-nowrap"> {generatedAt.meridiem}</span>
                          ) : null}
                        </span>
                        <span>
                          Updated {updatedAt.main}
                          {updatedAt.meridiem ? (
                            <span className="whitespace-nowrap"> {updatedAt.meridiem}</span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!deletingDraftId) {
              setPendingDelete(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
            aria-describedby="delete-draft-description"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
                  Delete draft
                </p>
                <h3
                  id="delete-draft-title"
                  className="mt-2 text-xl font-semibold text-gray-900"
                >
                  Remove this draft?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={Boolean(deletingDraftId)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close delete dialog"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <p
              id="delete-draft-description"
              className="mt-4 text-sm leading-6 text-gray-600"
            >
              Delete{' '}
              <span className="font-semibold text-gray-900">
                “{pendingDelete.subjectLine}”
              </span>
              ? This removes it from Newsletter History.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={Boolean(deletingDraftId)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void deleteDraft(pendingDelete.id)
                }
                disabled={Boolean(deletingDraftId)}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingDraftId === pendingDelete.id ? 'Deleting…' : 'Delete draft'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
