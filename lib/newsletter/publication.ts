import {
  getBeehiivDelivery,
  getBeehiivSyncOperation,
  isNewsletterDraftSourceVersionCurrent,
} from '@/lib/beehiiv/store'
import {
  getNewsletterDraft,
  NewsletterDraftConflictError,
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

export class NewsletterManagedPublicationVersionError extends Error {
  constructor() {
    super(
      'This Beehiiv post represents an older saved version. Sync the current draft before recording it as published.',
    )
    this.name = 'NewsletterManagedPublicationVersionError'
  }
}

export class NewsletterManagedPublicationBusyError extends Error {
  constructor() {
    super(
      'A Beehiiv sync is still running or needs recovery. Wait for it to finish before recording publication.',
    )
    this.name = 'NewsletterManagedPublicationBusyError'
  }
}

const PUBLICATION_BLOCKING_SYNC_STATES = new Set([
  'claimed',
  'creating',
  'updating',
  'remote_recorded',
  'ambiguous',
])

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
  expectedUpdatedAt: string,
): Promise<NewsletterDraftRecord> {
  const existing = await getNewsletterDraft(scope, draftId)
  if (existing.updatedAt !== expectedUpdatedAt) {
    throw new NewsletterDraftConflictError(draftId)
  }
  if (scope.ownerId) {
    const managedOperation = await getBeehiivSyncOperation(
      scope.ownerId,
      draftId,
    )
    if (
      managedOperation &&
      PUBLICATION_BLOCKING_SYNC_STATES.has(managedOperation.syncState)
    ) {
      throw new NewsletterManagedPublicationBusyError()
    }
    const managedDelivery = await getBeehiivDelivery(scope.ownerId, draftId)
    if (
      managedDelivery &&
      (!managedDelivery.sourceDraftUpdatedAt ||
        !(await isNewsletterDraftSourceVersionCurrent({
          ownerId: scope.ownerId,
          draftId,
          sourceDraftUpdatedAt: managedDelivery.sourceDraftUpdatedAt,
        })))
    ) {
      throw new NewsletterManagedPublicationVersionError()
    }
  }
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

  try {
    return await saveNewsletterDraft(scope, draftId, draft, 'published', {
      expectedUpdatedAt: existing.updatedAt,
    })
  } catch (error) {
    // The database repeats the managed-receipt gate in the same transaction as
    // the publication update. Translate a race at that boundary into the same
    // stable domain conflict returned by the preflight check above.
    if (
      error instanceof Error &&
      /Managed Beehiiv sync is still in flight or needs recovery/i.test(
        error.message,
      )
    ) {
      throw new NewsletterManagedPublicationBusyError()
    }
    if (
      error instanceof Error &&
      /Managed Beehiiv publication (?:content|source version) does not match/i.test(
        error.message,
      )
    ) {
      throw new NewsletterManagedPublicationVersionError()
    }
    throw error
  }
}
