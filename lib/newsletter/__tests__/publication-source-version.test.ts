import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterDraftRecord } from '../types'

const mocks = vi.hoisted(() => ({
  canSetNewsletterDraftStatus: vi.fn(),
  getBeehiivDelivery: vi.fn(),
  getBeehiivSyncOperation: vi.fn(),
  getNewsletterDraft: vi.fn(),
  isNewsletterDraftSourceVersionCurrent: vi.fn(),
  saveNewsletterDraft: vi.fn(),
}))

vi.mock('@/lib/beehiiv/store', () => ({
  getBeehiivDelivery: mocks.getBeehiivDelivery,
  getBeehiivSyncOperation: mocks.getBeehiivSyncOperation,
  isNewsletterDraftSourceVersionCurrent:
    mocks.isNewsletterDraftSourceVersionCurrent,
}))

vi.mock('../drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../drafts')>()
  return {
    ...actual,
    getNewsletterDraft: mocks.getNewsletterDraft,
    saveNewsletterDraft: mocks.saveNewsletterDraft,
  }
})

vi.mock('../workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workflow')>()
  return {
    ...actual,
    canSetNewsletterDraftStatus: mocks.canSetNewsletterDraftStatus,
  }
})

import {
  NewsletterManagedPublicationBusyError,
  NewsletterManagedPublicationVersionError,
  recordNewsletterPublication,
} from '../publication'

const OWNER_ID = '00000000-0000-4000-8000-000000000001'
const DRAFT_ID = '00000000-0000-4000-8000-000000000002'
const SOURCE_UPDATED_AT = '2026-08-07T12:00:00.123456Z'
const CURRENT_UPDATED_AT = '2026-08-07T12:05:00.123456Z'
const PUBLISHED_UPDATED_AT = '2026-08-07T13:00:00.123456Z'
const scope = { ownerId: OWNER_ID, sessionId: 'session-1' }

function draftFixture(): NewsletterDraftRecord {
  return {
    id: DRAFT_ID,
    ownerId: OWNER_ID,
    ticker: 'AAPL',
    status: 'ready',
    sourceType: 'manual',
    sourceReviewKey: null,
    beehiivUrl: null,
    publishedAt: null,
    archivedAt: null,
    attachedChartCount: 1,
    subjectLine: 'Apple setup',
    previewHtml: '<p>Apple setup</p>',
    draft: {
      ticker: 'AAPL',
      format: 'single_stock',
      featuredTickers: ['AAPL'],
      generatedAt: '2026-08-07T11:00:00.000Z',
      subjectLine: 'Apple setup',
      introText: 'What matters today.',
      autoPickedStock: false,
      blocks: [],
    },
    history: [],
    createdAt: '2026-08-07T11:00:00.000Z',
    updatedAt: CURRENT_UPDATED_AT,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getNewsletterDraft.mockResolvedValue(draftFixture())
  mocks.getBeehiivDelivery.mockResolvedValue(null)
  mocks.getBeehiivSyncOperation.mockResolvedValue(null)
  mocks.isNewsletterDraftSourceVersionCurrent.mockResolvedValue(true)
  mocks.canSetNewsletterDraftStatus.mockReturnValue({ ready: true, issues: [] })
  mocks.saveNewsletterDraft.mockResolvedValue(
    draftFixture() as NewsletterDraftRecord,
  )
})

describe('managed Beehiiv publication source versions', () => {
  it('rejects publishing local V2 when the managed Beehiiv receipt is V1', async () => {
    mocks.getBeehiivDelivery.mockResolvedValueOnce({
      sourceDraftUpdatedAt: SOURCE_UPDATED_AT,
    })
    mocks.isNewsletterDraftSourceVersionCurrent.mockResolvedValueOnce(false)

    await expect(
      recordNewsletterPublication(
        scope,
        DRAFT_ID,
        'https://theintraday.beehiiv.com/p/apple-setup',
        new Date('2026-08-07T13:00:00.000Z'),
        CURRENT_UPDATED_AT,
      ),
    ).rejects.toBeInstanceOf(NewsletterManagedPublicationVersionError)

    expect(mocks.isNewsletterDraftSourceVersionCurrent).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      draftId: DRAFT_ID,
      sourceDraftUpdatedAt: SOURCE_UPDATED_AT,
    })
    expect(mocks.saveNewsletterDraft).not.toHaveBeenCalled()
  })

  it('rejects manual publication while an initial managed create is in flight', async () => {
    mocks.getBeehiivSyncOperation.mockResolvedValueOnce({
      syncState: 'creating',
    })

    await expect(
      recordNewsletterPublication(
        scope,
        DRAFT_ID,
        'https://theintraday.beehiiv.com/p/apple-setup',
        new Date('2026-08-07T13:00:00.000Z'),
        CURRENT_UPDATED_AT,
      ),
    ).rejects.toBeInstanceOf(NewsletterManagedPublicationBusyError)

    expect(mocks.getBeehiivDelivery).not.toHaveBeenCalled()
    expect(mocks.saveNewsletterDraft).not.toHaveBeenCalled()
  })

  it('preserves manual publication when the draft has no managed delivery', async () => {
    await recordNewsletterPublication(
      scope,
      DRAFT_ID,
      'https://theintraday.beehiiv.com/p/apple-setup',
      new Date('2026-08-07T13:00:00.000Z'),
      CURRENT_UPDATED_AT,
    )

    expect(mocks.isNewsletterDraftSourceVersionCurrent).not.toHaveBeenCalled()
    expect(mocks.saveNewsletterDraft).toHaveBeenCalledWith(
      scope,
      DRAFT_ID,
      expect.objectContaining({
        publication: expect.objectContaining({
          beehiivUrl: 'https://theintraday.beehiiv.com/p/apple-setup',
        }),
      }),
      'published',
      { expectedUpdatedAt: CURRENT_UPDATED_AT },
    )
  })

  it('publishes an exact-current managed receipt and returns the metadata-only next version', async () => {
    mocks.getBeehiivDelivery.mockResolvedValueOnce({
      sourceDraftUpdatedAt: CURRENT_UPDATED_AT,
    })
    mocks.saveNewsletterDraft.mockResolvedValueOnce({
      ...draftFixture(),
      status: 'published',
      updatedAt: PUBLISHED_UPDATED_AT,
      beehiivUrl: 'https://theintraday.beehiiv.com/p/apple-setup',
    })

    const published = await recordNewsletterPublication(
      scope,
      DRAFT_ID,
      'https://theintraday.beehiiv.com/p/apple-setup',
      new Date('2026-08-07T13:00:00.000Z'),
      CURRENT_UPDATED_AT,
    )

    expect(mocks.isNewsletterDraftSourceVersionCurrent).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      draftId: DRAFT_ID,
      sourceDraftUpdatedAt: CURRENT_UPDATED_AT,
    })
    expect(published.updatedAt).toBe(PUBLISHED_UPDATED_AT)
    expect(published.status).toBe('published')
  })

  it('translates an atomic database-gate race into the managed version conflict', async () => {
    mocks.getBeehiivDelivery.mockResolvedValueOnce({
      sourceDraftUpdatedAt: CURRENT_UPDATED_AT,
    })
    mocks.saveNewsletterDraft.mockRejectedValueOnce(
      new Error(
        'Failed to persist newsletter draft: Managed Beehiiv publication source version does not match the saved draft version',
      ),
    )

    await expect(
      recordNewsletterPublication(
        scope,
        DRAFT_ID,
        'https://theintraday.beehiiv.com/p/apple-setup',
        new Date('2026-08-07T13:00:00.000Z'),
        CURRENT_UPDATED_AT,
      ),
    ).rejects.toBeInstanceOf(NewsletterManagedPublicationVersionError)
  })
})
