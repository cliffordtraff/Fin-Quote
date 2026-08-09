import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  deleteDraft: vi.fn(),
  getDraft: vi.fn(),
  normalizeDraft: vi.fn((draft) => draft),
  preserveMetadata: vi.fn((_existing, incoming) => incoming),
  reconcileCharts: vi.fn((_scope, _existing, incoming) => incoming),
  renderPreview: vi.fn(() => '<html></html>'),
  resolveScope: vi.fn(),
  saveDraft: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return {
    ...actual,
    deleteNewsletterDraft: mocks.deleteDraft,
    getNewsletterDraft: mocks.getDraft,
    normalizeNewsletterDraftDocument: mocks.normalizeDraft,
    preserveNewsletterDraftServerMetadata: mocks.preserveMetadata,
    reconcileNewsletterDraftClientCharts: mocks.reconcileCharts,
    renderNewsletterDraftPreviewHtml: mocks.renderPreview,
    saveNewsletterDraft: mocks.saveDraft,
  }
})

vi.mock('@/lib/newsletter/workflow', () => ({
  canSetNewsletterDraftStatus: vi.fn(() => ({ ready: true, issues: [] })),
  isNewsletterDraftStatus: vi.fn(() => true),
  resolveNewsletterDraftSaveStatus: vi.fn(() => 'published'),
}))

vi.mock('@/lib/newsletter/charting-platform-export', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/newsletter/charting-platform-export')
    >()
  return {
    ...actual,
    getDefaultPublicChartingBaseUrlForHost: vi.fn(
      () => 'https://charts.theintraday.com',
    ),
  }
})

import { DELETE, PATCH } from '@/app/api/newsletter/drafts/[id]/route'
import {
  NewsletterDraftConflictError,
  NewsletterPublishedDraftImmutableError,
} from '@/lib/newsletter/drafts'

const draftDocument = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: '2026-08-06T12:00:00.000Z',
  subjectLine: 'Apple update',
  introText: 'Apple moved after earnings.',
  autoPickedStock: false,
  blocks: [],
}

const publishedRecord = {
  id: 'draft-1',
  ownerId: 'user-1',
  ticker: 'AAPL',
  status: 'published',
  sourceType: 'manual',
  sourceReviewKey: null,
  beehiivUrl: 'https://theintraday.beehiiv.com/p/apple',
  publishedAt: '2026-08-06T13:00:00.000Z',
  archivedAt: null,
  attachedChartCount: 0,
  subjectLine: 'Apple update',
  previewHtml: '<html></html>',
  draft: draftDocument,
  history: [],
  createdAt: '2026-08-06T12:00:00.000Z',
  updatedAt: '2026-08-06T13:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.getDraft.mockResolvedValue(publishedRecord)
})

describe('published newsletter draft API immutability', () => {
  it('returns structured latest state without discarding a stale working copy', async () => {
    mocks.saveDraft.mockRejectedValue(new NewsletterDraftConflictError('draft-1'))
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: { ...draftDocument, subjectLine: 'My local edits' },
          expectedUpdatedAt: '2026-08-06T12:30:00.000Z',
        }),
      },
    )

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'draft_conflict',
      latest: {
        id: 'draft-1',
        status: 'published',
        updatedAt: publishedRecord.updatedAt,
      },
    })
  })

  it('returns 409 when a stale editor tries to rewrite published content', async () => {
    mocks.saveDraft.mockRejectedValue(
      new NewsletterPublishedDraftImmutableError('draft-1'),
    )
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: { ...draftDocument, subjectLine: 'Rewritten after publish' },
          status: 'published',
          expectedUpdatedAt: publishedRecord.updatedAt,
        }),
      },
    )

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('is immutable'),
    })
  })

  it('returns 409 when a client tries to delete a published draft', async () => {
    mocks.deleteDraft.mockRejectedValue(
      new NewsletterPublishedDraftImmutableError('draft-1'),
    )
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/drafts/draft-1',
      { method: 'DELETE' },
    )

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'draft-1' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('is immutable'),
    })
  })
})
