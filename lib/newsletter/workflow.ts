import type {
  NewsletterDraftDocument,
  NewsletterDraftStatus,
} from './types'
import { getSP500Constituent } from '@/lib/sp500'
import {
  hasUnsafeNewsletterControlCharacters,
  isSafeNewsletterLink,
  NEWSLETTER_SUBJECT_MAX_LENGTH,
} from './delivery-quality'
import { isNewsletterSourceEntityMatch } from './source-integrity'
import { isDailySourceFresh } from './daily-selection'
import { isPriceNewsletterChartSpec } from './chart-spec'
import { isNewsletterChartProvenanceCurrent } from './chart-provenance'

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
  if (subjectLine.length > NEWSLETTER_SUBJECT_MAX_LENGTH) {
    issues.push({
      id: 'subject-line-length',
      label: `Shorten the subject line to ${NEWSLETTER_SUBJECT_MAX_LENGTH} characters or fewer.`,
    })
  }
  if (hasUnsafeNewsletterControlCharacters(draft.subjectLine ?? '')) {
    issues.push({
      id: 'subject-line-controls',
      label: 'Remove hidden control characters from the subject line.',
    })
  }

  if (!hasVisibleText(draft.introText)) {
    issues.push({
      id: 'intro',
      label: 'Add newsletter intro copy.',
    })
  }

  if (draft.source?.type === 'daily_batch') {
    const source = draft.source.dailyBatch
    const constituent = getSP500Constituent(source.ticker)
    const companyName =
      constituent?.name ??
      source.companyName?.trim() ??
      source.ticker
    if (!constituent) {
      issues.push({
        id: 'source-registry',
        label: `Use a current S&P 500 company identity for ${source.ticker}.`,
      })
    }
    if (
      !isNewsletterSourceEntityMatch({
        ticker: source.ticker,
        companyName,
        text: source.headline,
      })
    ) {
      issues.push({
        id: 'source-entity',
        label: `Replace the source headline with evidence about ${companyName} (${source.ticker}).`,
      })
    }
    if (
      !isNewsletterSourceEntityMatch({
        ticker: source.ticker,
        companyName,
        text: source.summary,
      })
    ) {
      issues.push({
        id: 'source-summary-entity',
        label: `Replace the issue summary with verified reporting about ${companyName} (${source.ticker}).`,
      })
    }
    const hasFreshEntityEvidence = source.sourceRefs.some((sourceRef) => {
      const maxAgeDays =
        sourceRef.kind === 'earnings'
          ? 1
          : sourceRef.kind === 'news' || sourceRef.kind === 'finviz'
            ? 2
            : null
      return (
        maxAgeDays != null &&
        isDailySourceFresh(
          sourceRef.publishedAt,
          source.marketDate,
          maxAgeDays,
        ) &&
        isNewsletterSourceEntityMatch({
          ticker: source.ticker,
          companyName,
          text: sourceRef.label,
        })
      )
    })
    if (!hasFreshEntityEvidence) {
      issues.push({
        id: 'source-evidence',
        label: `Attach a fresh, entity-verified source for ${companyName} (${source.ticker}).`,
      })
    }
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

    if (hasUsableChartImage(block.chartImageUrl)) {
      const provenance = block.chartProvenance
      const scene = provenance?.scene
      const hasExactScene = scene
        ? isPriceNewsletterChartSpec(scene)
          ? Boolean(
              scene.chartExportSpec?.viewportTimeRange &&
                scene.chartExportSpec?.dataTimeRange,
            )
          : Boolean(scene.editorState)
        : false
      if (
        !provenance ||
        provenance.source === 'legacy' ||
        !isNewsletterChartProvenanceCurrent(provenance, {
          imageUrl: block.chartImageUrl,
          interactiveUrl: block.chartExportUrl,
          scene: block.chartSpec,
        }) ||
        !hasExactScene
      ) {
        issues.push({
          id: `block-${block.id}-chart-provenance`,
          blockId: block.id,
          label: `Recapture ${sectionLabel} so its immutable image and exact editable chart scene stay paired.`,
        })
      }
    }

    if (
      !hasVisibleText(block.chartAlt) ||
      (block.chartAlt?.trim().length ?? 0) < 12
    ) {
      issues.push({
        id: `block-${block.id}-chart-alt`,
        blockId: block.id,
        label: `Add descriptive chart alt text to ${sectionLabel}.`,
      })
    }

    if (block.chartExportUrl && !isSafeNewsletterLink(block.chartExportUrl)) {
      issues.push({
        id: `block-${block.id}-chart-link`,
        blockId: block.id,
        label: `Use a public HTTPS chart link for ${sectionLabel}.`,
      })
    }

    if (block.ctaUrl && !isSafeNewsletterLink(block.ctaUrl)) {
      issues.push({
        id: `block-${block.id}-cta-link`,
        blockId: block.id,
        label: `Use a public HTTPS CTA link for ${sectionLabel}.`,
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
      hasValidPublicationUrl = parsed.protocol === 'https:'
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
