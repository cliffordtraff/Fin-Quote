import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  bulkArchive: vi.fn(),
  resolveScope: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return {
    ...actual,
    bulkSetNewsletterDraftArchiveState: mocks.bulkArchive,
  }
})

import { POST } from '@/app/api/newsletter/drafts/bulk/route'
import {
  NewsletterDraftArchiveValidationError,
  NewsletterDraftConflictError,
} from '@/lib/newsletter/drafts'

const DRAFT_ID = 'd0000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.bulkArchive.mockResolvedValue([
    {
      id: DRAFT_ID,
      archivedAt: '2026-08-07T12:00:00.000Z',
      updatedAt: '2026-08-07T12:00:00.000Z',
      changed: true,
    },
  ])
})

function request() {
  return new NextRequest(
    'https://theintraday.com/api/newsletter/drafts/bulk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'archive',
        items: [
          {
            id: DRAFT_ID,
            expectedUpdatedAt: '2026-08-07T11:00:00.000Z',
          },
        ],
        idempotencyKey: 'archive-safe-key-123',
      }),
    },
  )
}

describe('newsletter archive bulk API', () => {
  it('returns explicit all-or-none archive outcomes', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.bulkArchive).toHaveBeenCalledWith(
      { ownerId: 'user-1', sessionId: 'session-1' },
      'archive',
      [
        {
          id: DRAFT_ID,
          expectedUpdatedAt: '2026-08-07T11:00:00.000Z',
        },
      ],
      'archive-safe-key-123',
    )
    await expect(response.json()).resolves.toMatchObject({
      results: [{ id: DRAFT_ID, changed: true }],
    })
  })

  it('maps stale selections to a refreshable 409', async () => {
    mocks.bulkArchive.mockRejectedValue(
      new NewsletterDraftConflictError(DRAFT_ID),
    )
    const response = await POST(request())
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'draft_conflict',
      error: expect.stringContaining('changed'),
    })
  })

  it('returns 400 for unsafe bulk input', async () => {
    mocks.bulkArchive.mockRejectedValue(
      new NewsletterDraftArchiveValidationError(
        'Select between 1 and 100 newsletter drafts',
      ),
    )
    const response = await POST(request())
    expect(response.status).toBe(400)
  })
})
