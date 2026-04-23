'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { NewsletterDraftSummary } from '@/lib/newsletter/types'

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

export default function NewsletterDraftsHome() {
  const [drafts, setDrafts] = useState<NewsletterDraftSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-300 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent Drafts</h2>
            <p className="mt-1 text-sm text-gray-600">
              Drafts are saved to this browser session by default and use your
              account storage only when you are signed in.
            </p>
          </div>
          <Link
            href="/newsletter/editor/new"
            className="inline-flex items-center rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
          >
            New draft
          </Link>
        </div>

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading drafts…</div>
        ) : drafts.length === 0 ? (
          <div className="py-10 text-sm text-gray-500">
            No drafts yet. Create one to start editing.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/newsletter/editor/${draft.id}`}
                className="rounded-2xl border border-gray-200 bg-cream-100 px-5 py-4 transition hover:border-sage-400 hover:bg-sage-50"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex rounded-full bg-sage-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                        {draft.format === 'market_roundup' ? 'Roundup' : draft.ticker}
                      </span>
                      {draft.format === 'market_roundup' ? (
                        <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">
                          {draft.featuredTickers.join(', ')}
                        </span>
                      ) : null}
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">
                        {draft.status}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-gray-900">
                      {draft.subjectLine}
                    </h3>
                  </div>

                  <div className="grid gap-1 text-sm text-gray-600 lg:text-right">
                    <span>{draft.blockCount} chart sections</span>
                    <span>Generated {formatDateTime(draft.generatedAt)}</span>
                    <span>Updated {formatDateTime(draft.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
