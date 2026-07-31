'use client'

import {
  canSetNewsletterDraftStatus,
  getNewsletterDraftReadiness,
  NEWSLETTER_WORKFLOW_STAGES,
} from '@/lib/newsletter/workflow'
import type {
  NewsletterDraftDocument,
  NewsletterDraftStatus,
} from '@/lib/newsletter/types'

interface NewsletterWorkflowBarProps {
  draft: NewsletterDraftDocument
  status: NewsletterDraftStatus
  busy: boolean
  onStatusChange: (status: NewsletterDraftStatus) => void
}

export default function NewsletterWorkflowBar({
  draft,
  status,
  busy,
  onStatusChange,
}: NewsletterWorkflowBarProps) {
  const readiness = getNewsletterDraftReadiness(draft)

  return (
    <section
      aria-label="Newsletter publishing workflow"
      className="border-y border-gray-200 bg-white px-5 py-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="grid min-w-0 flex-1 grid-cols-2 overflow-hidden rounded-lg border border-gray-300 sm:grid-cols-4"
          role="group"
          aria-label="Publishing stage"
        >
          {NEWSLETTER_WORKFLOW_STAGES.map((stage, index) => {
            const selected = status === stage.id
            const allowed = canSetNewsletterDraftStatus(draft, stage.id).ready

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onStatusChange(stage.id)}
                disabled={busy || selected || !allowed}
                aria-pressed={selected}
                title={
                  allowed
                    ? `Set stage to ${stage.label}`
                    : 'Resolve the readiness checks before using this stage'
                }
                className={`min-h-10 border-gray-300 px-3 py-2 text-xs font-semibold transition sm:border-l ${
                  index === 0 ? 'sm:border-l-0' : ''
                } ${
                  selected
                    ? 'bg-sage-700 text-white'
                    : 'bg-white text-gray-700 hover:bg-sage-50 hover:text-sage-900 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400'
                }`}
              >
                {stage.shortLabel}
              </button>
            )
          })}
        </div>

        <div className="min-w-0 lg:w-[360px]">
          {readiness.ready ? (
            <p className="text-sm font-medium text-sage-800">
              Content and charts are ready for publishing.
            </p>
          ) : (
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-amber-800">
                {readiness.issues.length}{' '}
                {readiness.issues.length === 1 ? 'check needs' : 'checks need'} attention
              </summary>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                {readiness.issues.map((issue) => (
                  <li key={issue.id}>{issue.label}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  )
}
