import {
  getNewsletterDraft,
  saveNewsletterDraft,
  type NewsletterDraftScope,
} from './drafts'
import type {
  NewsletterDraftReadiness,
} from './workflow'
import { canSetNewsletterDraftStatus } from './workflow'
import type { NewsletterDraftRecord } from './types'

const MAX_PUBLICATION_URL_LENGTH = 2000

export class NewsletterPublicationReadinessError extends Error {
  readonly readiness: NewsletterDraftReadiness

  constructor(readiness: NewsletterDraftReadiness) {
    super('Draft is not ready to be recorded as published')
    this.name = 'NewsletterPublicationReadinessError'
    this.readiness = readiness
  }
}

export function normalizeNewsletterPublicationUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Beehiiv publication URL is required')
  }
  if (trimmed.length > MAX_PUBLICATION_URL_LENGTH) {
    throw new Error(
      `Beehiiv publication URL must be ${MAX_PUBLICATION_URL_LENGTH} characters or fewer`,
    )
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Beehiiv publication URL must be a valid web address')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Beehiiv publication URL must use HTTP or HTTPS')
  }
  return parsed.toString()
}

export async function recordNewsletterPublication(
  scope: NewsletterDraftScope,
  draftId: string,
  beehiivUrl: string,
  now = new Date(),
): Promise<NewsletterDraftRecord> {
  const existing = await getNewsletterDraft(scope, draftId)
  const normalizedUrl = normalizeNewsletterPublicationUrl(beehiivUrl)
  const publishedAt =
    existing.draft.publication?.publishedAt ?? now.toISOString()
  const draft = {
    ...existing.draft,
    publication: {
      beehiivUrl: normalizedUrl,
      publishedAt,
    },
  }
  const readiness = canSetNewsletterDraftStatus(draft, 'published')
  if (!readiness.ready) {
    throw new NewsletterPublicationReadinessError(readiness)
  }

  return saveNewsletterDraft(scope, draftId, draft, 'published')
}
