'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { NewsletterDraftSummary } from '@/lib/newsletter/types'

interface DraftListResponse {
  drafts: NewsletterDraftSummary[]
}

interface DraftCreateResponse {
  draft: {
    id: string
  }
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
  const router = useRouter()
  const [drafts, setDrafts] = useState<NewsletterDraftSummary[]>([])
  const [ticker, setTicker] = useState('')
  const [generationPrompt, setGenerationPrompt] = useState('')
  const [format, setFormat] = useState<'single_stock' | 'market_roundup'>('single_stock')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
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

  const normalizedTicker = useMemo(() => ticker.trim().toUpperCase(), [ticker])
  const promptPlaceholder = useMemo(
    () =>
      format === 'market_roundup'
        ? 'Optional: describe the theme, sector, catalyst, or type of roundup you want. Example: Generate a newsletter based on chip stocks reacting to earnings.'
        : 'Optional: describe the angle you want. Example: Focus on margin pressure after earnings and whether the recent selloff looks overdone.',
    [format],
  )

  async function createDraft() {
    try {
      setCreating(true)
      setError(null)

      const response = await fetch('/api/newsletter/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: format === 'single_stock' ? normalizedTicker || undefined : undefined,
          format,
          generationPrompt: generationPrompt.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as DraftCreateResponse & {
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create newsletter draft')
      }

      router.push(`/newsletter/editor/${payload.draft.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create newsletter draft')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-300 bg-white p-8 shadow-sm">
        <div className="flex justify-end">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-cream-100 p-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
              Start A Draft
            </label>
            <p className="mt-2 text-sm text-gray-600">
              Choose a single-stock deep dive or a 3-5 stock market roundup.
            </p>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setFormat('single_stock')}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    format === 'single_stock'
                      ? 'bg-sage-700 text-white'
                      : 'text-gray-700 hover:bg-cream-100'
                  }`}
                >
                  Single stock
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('market_roundup')}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    format === 'market_roundup'
                      ? 'bg-sage-700 text-white'
                      : 'text-gray-700 hover:bg-cream-100'
                  }`}
                >
                  Market roundup
                </button>
              </div>

              {format === 'single_stock' ? (
                <input
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value)}
                  placeholder="AAPL"
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium uppercase tracking-[0.16em] text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                />
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-600">
                  What should this newsletter focus on?
                </label>
                <p className="mt-2 text-sm text-gray-500">
                  {format === 'market_roundup'
                    ? 'Leave this blank to auto-pick 3-5 of today’s most interesting names, or describe the theme you want.'
                    : 'Leave this blank for the default deep dive, or describe the angle you want the generator to emphasize.'}
                </p>
                <textarea
                  value={generationPrompt}
                  onChange={(event) => setGenerationPrompt(event.target.value)}
                  placeholder={promptPlaceholder}
                  rows={4}
                  maxLength={500}
                  className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                />
              </div>

              <button
                type="button"
                onClick={createDraft}
                disabled={creating}
                className="rounded-xl bg-sage-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-gray-300 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent Drafts</h2>
            <p className="mt-1 text-sm text-gray-600">
              Drafts are saved to this browser session by default and use your
              account storage only when you are signed in.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-sm text-gray-500">Loading drafts…</div>
        ) : drafts.length === 0 ? (
          <div className="py-10 text-sm text-gray-500">
            No drafts yet. Generate one above to start editing.
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
