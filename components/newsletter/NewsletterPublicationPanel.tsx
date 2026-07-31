'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type {
  NewsletterDraftEvent,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'

interface NewsletterPublicationPanelProps {
  record: NewsletterDraftRecord
  disabled?: boolean
  onRecordChange: (record: NewsletterDraftRecord) => void
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

function eventLabel(event: NewsletterDraftEvent): string {
  if (event.type === 'created') {
    return event.metadata.sourceType === 'catalyst'
      ? 'Draft created from approved catalyst'
      : 'Draft created'
  }
  if (event.type === 'status_changed') {
    return `Stage changed from ${event.fromStatus ?? 'new'} to ${event.toStatus ?? 'draft'}`
  }
  if (event.type === 'chart_attached') {
    const chartIds = Array.isArray(event.metadata.chartIds)
      ? event.metadata.chartIds
      : []
    return `${chartIds.length || 1} saved ${chartIds.length === 1 ? 'chart' : 'charts'} attached`
  }
  if (event.type === 'publication_url_updated') {
    return 'Beehiiv publication URL updated'
  }
  if (event.type === 'beehiiv_draft_created') {
    return 'Beehiiv draft created'
  }
  if (event.type === 'beehiiv_draft_synced') {
    return 'Beehiiv draft synced'
  }
  return 'Publication recorded'
}

export default function NewsletterPublicationPanel({
  record,
  disabled = false,
  onRecordChange,
}: NewsletterPublicationPanelProps) {
  const [beehiivUrl, setBeehiivUrl] = useState(record.beehiivUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const source = record.draft.source

  useEffect(() => {
    setBeehiivUrl(record.beehiivUrl ?? '')
  }, [record.beehiivUrl])

  const history = useMemo(
    () => [...record.history].reverse(),
    [record.history],
  )

  async function recordPublication() {
    try {
      setSaving(true)
      setError(null)
      setNotice(null)
      const response = await fetch(
        `/api/newsletter/drafts/${record.id}/publication`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ beehiivUrl }),
        },
      )
      const payload = (await response.json().catch(() => ({}))) as {
        draft?: NewsletterDraftRecord
        error?: string
        issues?: Array<{ label?: string }>
      }
      if (!response.ok || !payload.draft) {
        const issueText = payload.issues
          ?.map((issue) => issue.label)
          .filter(Boolean)
          .join(' ')
        throw new Error(
          issueText || payload.error || 'Failed to record publication',
        )
      }

      onRecordChange(payload.draft)
      setNotice(
        record.beehiivUrl
          ? 'Beehiiv publication URL updated.'
          : 'Publication recorded and issue marked published.',
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to record publication',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label="Newsletter source and publication history"
      className="border-b border-gray-200 bg-gray-50 px-5 py-4"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-950">
              Issue provenance
            </h2>
            <span className="border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
              {record.sourceType}
            </span>
            {source ? (
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  source.automationStatus === 'complete'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {source.automationStatus === 'complete'
                  ? 'Automation complete'
                  : 'Chart needed'}
              </span>
            ) : null}
          </div>

          {source?.type === 'catalyst' ? (
            <div className="mt-2 space-y-1 text-sm leading-5 text-gray-600">
              <p>
                <span className="font-semibold text-gray-900">
                  {source.catalyst.symbol}
                </span>{' '}
                · {source.catalyst.headline}
              </p>
              <p>
                Approved {source.catalyst.reviewedAt
                  ? formatDateTime(source.catalyst.reviewedAt)
                  : source.catalyst.marketDate}
                {' · '}
                {source.attachedChartIds.length}{' '}
                {source.attachedChartIds.length === 1 ? 'chart' : 'charts'} attached
              </p>
              <div className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
                <Link
                  href="/admin/why-moved"
                  className="text-sage-700 hover:text-sage-900"
                >
                  Open catalyst queue
                </Link>
                {source.catalyst.sourceUrl ? (
                  <a
                    href={source.catalyst.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sage-700 hover:text-sage-900"
                  >
                    Open source
                  </a>
                ) : null}
              </div>
              {source.automationWarning ? (
                <p className="border-l-2 border-amber-400 pl-3 text-xs text-amber-800">
                  {source.automationWarning}
                </p>
              ) : null}
            </div>
          ) : source?.type === 'daily_batch' ? (
            <div className="mt-2 space-y-1 text-sm leading-5 text-gray-600">
              <p>
                <span className="font-semibold text-gray-900">
                  #{source.dailyBatch.rank} {source.dailyBatch.ticker}
                </span>{' '}
                · {source.dailyBatch.headline}
              </p>
              <p>
                {source.dailyBatch.marketDate}
                {' · '}
                relevance {Math.round(source.dailyBatch.relevanceScore)}
                {' · '}
                {source.attachedChartIds.length}{' '}
                {source.attachedChartIds.length === 1 ? 'chart' : 'charts'} attached
              </p>
              <div className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
                <Link
                  href="/newsletter/morning-review"
                  className="text-sage-700 hover:text-sage-900"
                >
                  Open morning queue
                </Link>
                {source.dailyBatch.sourceRefs.find((entry) => entry.url)?.url ? (
                  <a
                    href={
                      source.dailyBatch.sourceRefs.find((entry) => entry.url)
                        ?.url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-sage-700 hover:text-sage-900"
                  >
                    Open source
                  </a>
                ) : null}
              </div>
              {source.automationWarning ? (
                <p className="border-l-2 border-amber-400 pl-3 text-xs text-amber-800">
                  {source.automationWarning}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              This issue was started from the newsletter editor.
            </p>
          )}

          <details className="mt-4 border-t border-gray-200 pt-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
              Issue history · {history.length} events
            </summary>
            {history.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {history.map((event) => (
                  <li
                    key={event.id}
                    className="grid gap-1 text-xs text-gray-600 sm:grid-cols-[150px_minmax(0,1fr)]"
                  >
                    <time dateTime={event.createdAt}>
                      {formatDateTime(event.createdAt)}
                    </time>
                    <span className="font-medium text-gray-800">
                      {eventLabel(event)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                History begins with the next saved workflow event.
              </p>
            )}
          </details>
        </div>

        <div className="border-t border-gray-200 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <h2 className="text-sm font-semibold text-gray-950">
            Beehiiv publication
          </h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Recording the live issue URL marks this draft as published and adds
            the change to its history.
          </p>
          <label className="mt-3 block">
            <span className="sr-only">Beehiiv publication URL</span>
            <input
              type="url"
              inputMode="url"
              value={beehiivUrl}
              onChange={(event) => setBeehiivUrl(event.target.value)}
              placeholder="https://your-publication.beehiiv.com/p/..."
              disabled={disabled || saving}
              className="h-10 w-full border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 disabled:bg-gray-100"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void recordPublication()}
              disabled={disabled || saving || !beehiivUrl.trim()}
              className="min-h-10 bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? 'Recording...'
                : record.beehiivUrl
                  ? 'Update publication URL'
                  : 'Record publication'}
            </button>
            {record.beehiivUrl ? (
              <a
                href={record.beehiivUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-sage-700 hover:text-sage-900"
              >
                Open published issue
              </a>
            ) : null}
          </div>
          {record.publishedAt ? (
            <p className="mt-2 text-xs text-gray-500">
              Published {formatDateTime(record.publishedAt)}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs leading-5 text-red-700">{error}</p>
          ) : null}
          {notice ? (
            <p className="mt-3 text-xs leading-5 text-sage-800">{notice}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
