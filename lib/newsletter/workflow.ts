import type {
  NewsletterDraftDocument,
  NewsletterDraftStatus,
} from './types'

export interface NewsletterWorkflowStage {
  id: NewsletterDraftStatus
  label: string
  shortLabel: string
}

export interface NewsletterReadinessIssue {
  id: string
  label: string
  blockId?: string
}

export interface NewsletterDraftReadiness {
  ready: boolean
  issues: NewsletterReadinessIssue[]
}

export const NEWSLETTER_WORKFLOW_STAGES: NewsletterWorkflowStage[] = [
  { id: 'draft', label: 'Drafting', shortLabel: 'Draft' },
  { id: 'review', label: 'In review', shortLabel: 'Review' },
  { id: 'ready', label: 'Ready to publish', shortLabel: 'Ready' },
  { id: 'published', label: 'Published', shortLabel: 'Published' },
]

const NEWSLETTER_DRAFT_STATUSES = new Set<NewsletterDraftStatus>(
  NEWSLETTER_WORKFLOW_STAGES.map((stage) => stage.id),
)

function hasVisibleText(value: string | null | undefined): boolean {
  if (!value) return false
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length > 0
}

function hasUsableChartImage(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? ''
  return Boolean(normalized) && !normalized.startsWith('data:image/svg+xml')
}

export function isNewsletterDraftStatus(
  value: unknown,
): value is NewsletterDraftStatus {
  return (
    typeof value === 'string' &&
    NEWSLETTER_DRAFT_STATUSES.has(value as NewsletterDraftStatus)
  )
}

export function getNewsletterWorkflowStage(
  status: NewsletterDraftStatus,
): NewsletterWorkflowStage {
  return (
    NEWSLETTER_WORKFLOW_STAGES.find((stage) => stage.id === status) ??
    NEWSLETTER_WORKFLOW_STAGES[0]
  )
}

export function getNewsletterDraftReadiness(
  draft: NewsletterDraftDocument,
): NewsletterDraftReadiness {
  const issues: NewsletterReadinessIssue[] = []
  const subjectLine = draft.subjectLine?.trim() ?? ''

  if (
    !subjectLine ||
    /^untitled(?:\s+(?:newsletter|market roundup))?$/i.test(subjectLine)
  ) {
    issues.push({
      id: 'subject-line',
      label: 'Replace the placeholder subject line.',
    })
  }

  if (!hasVisibleText(draft.introText)) {
    issues.push({
      id: 'intro',
      label: 'Add newsletter intro copy.',
    })
  }

  if (!Array.isArray(draft.blocks) || draft.blocks.length === 0) {
    issues.push({
      id: 'sections',
      label: 'Add at least one newsletter section.',
    })
  }

  for (const [index, block] of draft.blocks.entries()) {
    const sectionLabel = block.heading?.trim() || `Section ${index + 1}`

    if (!hasVisibleText(block.heading)) {
      issues.push({
        id: `block-${block.id}-heading`,
        blockId: block.id,
        label: `Add a heading to section ${index + 1}.`,
      })
    }

    if (!hasVisibleText(block.body)) {
      issues.push({
        id: `block-${block.id}-body`,
        blockId: block.id,
        label: `Add commentary to ${sectionLabel}.`,
      })
    }

    if (block.chartNeedsRegeneration || !hasUsableChartImage(block.chartImageUrl)) {
      issues.push({
        id: `block-${block.id}-chart`,
        blockId: block.id,
        label: `Capture a final chart for ${sectionLabel}.`,
      })
    }
  }

  return {
    ready: issues.length === 0,
    issues,
  }
}

export function canSetNewsletterDraftStatus(
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus,
): NewsletterDraftReadiness {
  if (status === 'draft' || status === 'review') {
    return { ready: true, issues: [] }
  }

  const readiness = getNewsletterDraftReadiness(draft)
  if (status !== 'published') return readiness

  const beehiivUrl = draft.publication?.beehiivUrl?.trim() ?? ''
  let hasValidPublicationUrl = false
  if (beehiivUrl) {
    try {
      const parsed = new URL(beehiivUrl)
      hasValidPublicationUrl =
        parsed.protocol === 'https:' || parsed.protocol === 'http:'
    } catch {
      hasValidPublicationUrl = false
    }
  }

  if (!hasValidPublicationUrl) {
    return {
      ready: false,
      issues: [
        ...readiness.issues,
        {
          id: 'beehiiv-url',
          label: 'Record the Beehiiv publication URL before marking published.',
        },
      ],
    }
  }

  return readiness
}

export function resolveNewsletterDraftSaveStatus(options: {
  currentStatus: NewsletterDraftStatus
  requestedStatus: NewsletterDraftStatus
  hasExplicitStatus: boolean
  contentChanged: boolean
}): NewsletterDraftStatus {
  if (options.hasExplicitStatus || !options.contentChanged) {
    return options.requestedStatus
  }

  return options.currentStatus === 'ready' || options.currentStatus === 'published'
    ? 'review'
    : options.requestedStatus
}
