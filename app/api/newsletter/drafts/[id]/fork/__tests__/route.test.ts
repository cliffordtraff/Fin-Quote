import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  forkDraft: vi.fn(),
  resolveScope: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return { ...actual, forkNewsletterDraft: mocks.forkDraft }
})

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

import { POST } from '@/app/api/newsletter/drafts/[id]/fork/route'
import { NewsletterDraftIdempotencyConflictError } from '@/lib/newsletter/drafts'

const SOURCE_DRAFT_ID = 'd0000000-0000-4000-8000-000000000001'
const IDEMPOTENCY_KEY = 'fork-request-123'

const workingDraft = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: '2026-08-07T12:00:00.000Z',
  subjectLine: 'Local Apple correction',
  introText: 'Unsaved local work.',
  autoPickedStock: false,
  blocks: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.forkDraft.mockResolvedValue({
    id: 'copy-1',
    status: 'draft',
    subjectLine: 'Copy of Local Apple correction',
  })
})

describe('newsletter draft fork API', () => {
  it('saves the retained working copy as a new independent draft', async () => {
    const request = new NextRequest(
      `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          draft: workingDraft,
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      },
    )
    const response = await POST(request, {
      params: Promise.resolve({ id: SOURCE_DRAFT_ID }),
    })

    expect(response.status).toBe(201)
    expect(mocks.forkDraft).toHaveBeenCalledWith(
      { ownerId: 'user-1', sessionId: 'session-1' },
      SOURCE_DRAFT_ID,
      workingDraft,
      expect.objectContaining({
        idempotencyKey: IDEMPOTENCY_KEY,
        publicChartBaseUrl: 'https://charts.theintraday.com',
        signal: request.signal,
      }),
    )
    await expect(response.json()).resolves.toMatchObject({
      draft: { id: 'copy-1', status: 'draft' },
    })
  })

  it('requires a draft document', async () => {
    const response = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: IDEMPOTENCY_KEY }),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )
    expect(response.status).toBe(400)
    expect(mocks.forkDraft).not.toHaveBeenCalled()
  })

  it('requires a valid idempotency key', async () => {
    const response = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: workingDraft, idempotencyKey: 'short' }),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.forkDraft).not.toHaveBeenCalled()
  })

  it('rejects malformed, schema-unbounded, and oversized JSON before calling the draft service', async () => {
    const malformed = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({
      error: expect.stringContaining('valid JSON'),
    })

    const schemaUnbounded = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: {
              ...workingDraft,
              subjectLine: 'x'.repeat(1001),
            },
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )
    expect(schemaUnbounded.status).toBe(400)
    await expect(schemaUnbounded.json()).resolves.toMatchObject({
      error: expect.stringContaining('subjectLine'),
    })

    const oversized = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'x'.repeat(1024 * 1024 + 1),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )
    expect(oversized.status).toBe(400)
    await expect(oversized.json()).resolves.toMatchObject({
      error: expect.stringContaining('too large'),
    })
    expect(mocks.forkDraft).not.toHaveBeenCalled()
  })

  it('rejects JSON lookalike media types and invalid source IDs', async () => {
    const lookalike = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json-patch+json' },
          body: JSON.stringify({
            draft: workingDraft,
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )
    expect(lookalike.status).toBe(400)

    const invalidId = await POST(
      new NextRequest(
        'https://theintraday.com/api/newsletter/drafts/not-a-uuid/fork',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: workingDraft,
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        },
      ),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    )
    expect(invalidId.status).toBe(400)
    expect(mocks.forkDraft).not.toHaveBeenCalled()
  })

  it('maps idempotency-key reuse with different content to 409', async () => {
    mocks.forkDraft.mockRejectedValueOnce(
      new NewsletterDraftIdempotencyConflictError(),
    )
    const response = await POST(
      new NextRequest(
        `https://theintraday.com/api/newsletter/drafts/${SOURCE_DRAFT_ID}/fork`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: workingDraft,
            idempotencyKey: IDEMPOTENCY_KEY,
          }),
        },
      ),
      { params: Promise.resolve({ id: SOURCE_DRAFT_ID }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('reused'),
    })
  })
})
