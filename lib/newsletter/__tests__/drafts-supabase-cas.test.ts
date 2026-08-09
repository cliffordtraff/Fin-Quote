import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  updateFilters: [] as Array<{ column: string; value: unknown }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import {
  forkNewsletterDraft,
  NewsletterDraftConflictError,
  saveNewsletterDraft,
} from '@/lib/newsletter/drafts'
import type { NewsletterDraftDocument } from '@/lib/newsletter/types'

const ORIGINAL_UPDATED_AT = '2026-08-06T14:00:00.000Z'
const PUBLISHED_UPDATED_AT = '2026-08-06T14:01:00.000Z'

const draft: NewsletterDraftDocument = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: ORIGINAL_UPDATED_AT,
  subjectLine: 'Apple newsletter',
  introText: 'Apple moved higher.',
  autoPickedStock: false,
  blocks: [],
}

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    owner_id: 'user-1',
    session_id: 'session-1',
    ticker: 'AAPL',
    status: 'draft',
    source_type: null,
    source_review_key: null,
    beehiiv_url: null,
    published_at: null,
    subject_line: draft.subjectLine,
    preview_html: '<html></html>',
    draft_json: draft,
    created_at: ORIGINAL_UPDATED_AT,
    updated_at: ORIGINAL_UPDATED_AT,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateFilters.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Supabase newsletter draft CAS', () => {
  it('fences the update by id, updated_at, and status and preserves a concurrent publication', async () => {
    const publication = {
      beehiivUrl: 'https://theintraday.beehiiv.com/p/apple',
      publishedAt: PUBLISHED_UPDATED_AT,
    }
    let currentRow = buildRow()

    mocks.from.mockImplementation((table: string) => {
      let operation: 'select' | 'update' = 'select'
      const filters: Array<{ column: string; value: unknown }> = []
      const query = {
        select: vi.fn(() => query),
        update: vi.fn(() => {
          operation = 'update'
          return query
        }),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ column, value })
          return query
        }),
        is: vi.fn((column: string, value: unknown) => {
          filters.push({ column, value })
          return query
        }),
        order: vi.fn(() => query),
        single: vi.fn(async () => ({
          data: table === 'newsletter_drafts' ? currentRow : null,
          error: null,
        })),
        maybeSingle: vi.fn(async () => {
          if (table !== 'newsletter_drafts' || operation !== 'update') {
            return { data: null, error: null }
          }

          mocks.updateFilters.push(...filters)
          currentRow = buildRow({
            status: 'published',
            beehiiv_url: publication.beehiivUrl,
            published_at: publication.publishedAt,
            draft_json: { ...draft, publication },
            updated_at: PUBLISHED_UPDATED_AT,
          })
          const matchesPublishedRow = filters.every(({ column, value }) =>
            currentRow[column as keyof typeof currentRow] === value,
          )
          return {
            data: matchesPublishedRow ? currentRow : null,
            error: null,
          }
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null })),
      }
      return query
    })
    mocks.createClient.mockReturnValue({ from: mocks.from })

    await expect(
      saveNewsletterDraft(
        { ownerId: 'user-1', sessionId: 'session-1' },
        'draft-1',
        { ...draft, subjectLine: 'Stale automated copy' },
        'draft',
        {
          expectedUpdatedAt: ORIGINAL_UPDATED_AT,
          protectPublished: true,
        },
      ),
    ).rejects.toBeInstanceOf(NewsletterDraftConflictError)

    expect(mocks.updateFilters).toEqual(
      expect.arrayContaining([
        { column: 'id', value: 'draft-1' },
        { column: 'updated_at', value: ORIGINAL_UPDATED_AT },
        { column: 'status', value: 'draft' },
      ]),
    )
    expect(currentRow).toMatchObject({
      status: 'published',
      beehiiv_url: publication.beehiivUrl,
      published_at: publication.publishedAt,
    })
    expect(currentRow.draft_json.publication).toEqual(publication)
    expect(currentRow.subject_line).toBe('Apple newsletter')
  })

  it('checks the fork receipt and maps a first signed-in fork to the atomic RPC', async () => {
    const sourceId = 'd0000000-0000-4000-8000-000000000001'
    const createdId = 'd0000000-0000-4000-8000-000000000002'
    const workingDraft: NewsletterDraftDocument = {
      ...draft,
      subjectLine: 'Unsaved signed-in rewrite',
    }
    const sourceRow = buildRow({ id: sourceId })
    const createdDraft: NewsletterDraftDocument = {
      ...workingDraft,
      manualDraft: true,
      generatedAt: '2026-08-06T14:02:00.000Z',
      subjectLine: 'Copy of Unsaved signed-in rewrite',
    }
    const createdRow = buildRow({
      id: createdId,
      subject_line: createdDraft.subjectLine,
      draft_json: createdDraft,
      created_at: '2026-08-06T14:02:00.000Z',
      updated_at: '2026-08-06T14:02:00.000Z',
    })
    const receiptFilters: Array<{ column: string; value: unknown }> = []
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          if (table === 'newsletter_draft_fork_requests') {
            receiptFilters.push({ column, value })
          }
          return query
        }),
        order: vi.fn(() => query),
        single: vi.fn(async () => ({
          data: table === 'newsletter_drafts' ? sourceRow : null,
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({
          data:
            table === 'newsletter_draft_fork_requests'
              ? null
              : table === 'newsletter_drafts'
                ? sourceRow
                : null,
          error: null,
        })),
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      }
      return query
    })
    const rpc = vi.fn().mockResolvedValue({ data: [createdRow], error: null })
    mocks.createClient.mockReturnValue({ from, rpc })

    const result = await forkNewsletterDraft(
      { ownerId: 'user-1', sessionId: 'session-1' },
      sourceId,
      workingDraft,
      {
        idempotencyKey: 'fork-signed-in-001',
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    expect(from).toHaveBeenCalledWith('newsletter_draft_fork_requests')
    expect(receiptFilters).toEqual([
      { column: 'owner_id', value: 'user-1' },
      { column: 'idempotency_key', value: 'fork-signed-in-001' },
    ])
    expect(rpc).toHaveBeenCalledWith(
      'create_newsletter_draft_fork',
      expect.objectContaining({
        p_owner_id: 'user-1',
        p_source_draft_id: sourceId,
        p_source_updated_at: ORIGINAL_UPDATED_AT,
        p_session_id: 'session-1',
        p_idempotency_key: 'fork-signed-in-001',
        p_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_draft_json: expect.objectContaining({
          manualDraft: true,
          subjectLine: 'Copy of Unsaved signed-in rewrite',
        }),
        p_preview_html: expect.any(String),
      }),
    )
    expect(result).toMatchObject({
      id: createdId,
      status: 'draft',
      subjectLine: 'Copy of Unsaved signed-in rewrite',
      history: [],
    })
  })
})
