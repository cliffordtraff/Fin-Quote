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

    const result = await saveNewsletterDraft(
      { ownerId: 'user-1', sessionId: 'session-1' },
      'draft-1',
      { ...draft, subjectLine: 'Stale automated copy' },
      'draft',
      {
        expectedUpdatedAt: ORIGINAL_UPDATED_AT,
        protectPublished: true,
      },
    )

    expect(mocks.updateFilters).toEqual(
      expect.arrayContaining([
        { column: 'id', value: 'draft-1' },
        { column: 'updated_at', value: ORIGINAL_UPDATED_AT },
        { column: 'status', value: 'draft' },
      ]),
    )
    expect(result).toMatchObject({
      status: 'published',
      beehiivUrl: publication.beehiivUrl,
      publishedAt: publication.publishedAt,
    })
    expect(result.draft.publication).toEqual(publication)
    expect(result.subjectLine).toBe('Apple newsletter')
  })
})
