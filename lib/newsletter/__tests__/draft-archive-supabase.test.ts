import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  queries: [] as Array<{
    columns: string
    filters: Array<{ method: string; args: unknown[] }>
    orders: Array<{ column: string; ascending: boolean | undefined }>
    limit: number | null
    signal: AbortSignal | null
  }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import {
  bulkSetNewsletterDraftArchiveState,
  listNewsletterDraftArchivePage,
  NewsletterDraftConflictError,
} from '@/lib/newsletter/drafts'

const GENERATED_AT = '2026-08-07T12:00:00.000Z'
const MICROSECOND_CURSOR_GENERATED_AT = '2026-08-07T12:00:00.123456+00:00'

function draftId(index: number): string {
  return `d0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function buildRow(index: number) {
  return {
    id: draftId(100 - index),
    owner_id: 'user-1',
    session_id: 'session-1',
    ticker: 'AAPL',
    status: 'ready',
    source_type: 'manual',
    source_review_key: null,
    beehiiv_url: null,
    published_at: null,
    archived_at: null,
    format: 'single_stock',
    featured_tickers: ['AAPL'],
    ticker_symbols: ['AAPL'],
    generated_at: GENERATED_AT,
    block_count: 3,
    attached_chart_count: 3,
    subject_line: `Apple issue ${index}`,
    created_at: GENERATED_AT,
    updated_at: `2026-08-07T13:${String(index).padStart(2, '0')}:00.000Z`,
  }
}

function installSupabaseResults(
  results: Array<{ data?: unknown; count?: number | null; error?: unknown }>,
) {
  let queryIndex = 0
  const from = vi.fn(() => {
    const result = results[queryIndex] ?? { data: [], error: null }
    queryIndex += 1
    const trace = {
      columns: '',
      filters: [] as Array<{ method: string; args: unknown[] }>,
      orders: [] as Array<{ column: string; ascending: boolean | undefined }>,
      limit: null as number | null,
      signal: null as AbortSignal | null,
    }
    mocks.queries.push(trace)
    const query = {
      select: vi.fn((columns: string) => {
        trace.columns = columns
        return query
      }),
      eq: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'eq', args })
        return query
      }),
      is: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'is', args })
        return query
      }),
      not: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'not', args })
        return query
      }),
      contains: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'contains', args })
        return query
      }),
      gte: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'gte', args })
        return query
      }),
      lt: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'lt', args })
        return query
      }),
      or: vi.fn((...args: unknown[]) => {
        trace.filters.push({ method: 'or', args })
        return query
      }),
      order: vi.fn(
        (column: string, options?: { ascending?: boolean }) => {
          trace.orders.push({ column, ascending: options?.ascending })
          return query
        },
      ),
      limit: vi.fn((value: number) => {
        trace.limit = value
        return query
      }),
      abortSignal: vi.fn((signal: AbortSignal) => {
        trace.signal = signal
        return query
      }),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({
          data: result.data ?? null,
          count: result.count ?? null,
          error: result.error ?? null,
        }).then(resolve, reject),
    }
    return query
  })
  mocks.createClient.mockReturnValue({ from })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queries.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Supabase newsletter archive query', () => {
  it('uses summary-only keyset pagination and returns global facets', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => buildRow(index))
    installSupabaseResults([
      { data: rows },
      { count: 7 },
      { count: 9 },
      { count: 12 },
      { count: 3 },
      { count: 12 },
      { count: 4 },
    ])
    const controller = new AbortController()
    const cursor = Buffer.from(
      JSON.stringify({
        generatedAt: MICROSECOND_CURSOR_GENERATED_AT,
        id: draftId(200),
      }),
      'utf8',
    ).toString('base64url')

    const page = await listNewsletterDraftArchivePage(
      { ownerId: 'user-1', sessionId: 'session-1' },
      {
        search: 'Apple',
        status: 'ready',
        ticker: 'AAPL',
        from: '2026-08-01',
        to: '2026-08-07',
        visibility: 'active',
        cursor,
        pageSize: 25,
      },
      controller.signal,
    )

    expect(page).toMatchObject({
      pageSize: 25,
      total: 12,
      hasMore: true,
      facets: {
        statuses: { draft: 7, review: 9, ready: 12, published: 3 },
        active: 12,
        archived: 4,
      },
    })
    expect(page.drafts).toHaveLength(25)
    expect(page.nextCursor).toBeTruthy()
    expect(
      JSON.parse(Buffer.from(page.nextCursor!, 'base64url').toString('utf8')),
    ).toEqual({
      generatedAt: GENERATED_AT,
      id: rows[24]!.id,
    })

    expect(mocks.queries).toHaveLength(7)
    const dataQuery = mocks.queries[0]!
    expect(dataQuery.columns).not.toContain('draft_json')
    expect(dataQuery.orders).toEqual([
      { column: 'generated_at', ascending: false },
      { column: 'id', ascending: false },
    ])
    expect(dataQuery.limit).toBe(26)
    expect(dataQuery.signal).toBe(controller.signal)
    expect(dataQuery.filters).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['owner_id', 'user-1'] },
        { method: 'eq', args: ['status', 'ready'] },
        { method: 'is', args: ['archived_at', null] },
        { method: 'contains', args: ['ticker_symbols', ['AAPL']] },
        { method: 'gte', args: ['generated_at', '2026-08-01T00:00:00.000Z'] },
        { method: 'lt', args: ['generated_at', '2026-08-08T00:00:00.000Z'] },
      ]),
    )
    const orFilters = dataQuery.filters
      .filter((filter) => filter.method === 'or')
      .map((filter) => String(filter.args[0]))
    expect(orFilters).toEqual([
      expect.stringContaining('subject_line.ilike.%Apple%'),
      expect.stringContaining(
        `generated_at.lt.${MICROSECOND_CURSOR_GENERATED_AT},and(generated_at.eq.${MICROSECOND_CURSOR_GENERATED_AT},id.lt.${draftId(200)})`,
      ),
    ])
    expect(mocks.queries.every((query) => query.signal === controller.signal)).toBe(
      true,
    )
  })

  it('fails the whole page when any facet query fails', async () => {
    installSupabaseResults([
      { data: [buildRow(0)] },
      { count: 1 },
      { error: { message: 'facet count failed' } },
      { count: 1 },
      { count: 0 },
      { count: 1 },
      { count: 0 },
    ])

    await expect(
      listNewsletterDraftArchivePage(
        { ownerId: 'user-1', sessionId: 'session-1' },
        { visibility: 'all' },
      ),
    ).rejects.toThrow('facet count failed')
  })

  it('rejects a non-UUID cursor before issuing any Supabase query', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        generatedAt: MICROSECOND_CURSOR_GENERATED_AT,
        id: 'draft-200',
      }),
      'utf8',
    ).toString('base64url')

    await expect(
      listNewsletterDraftArchivePage(
        { ownerId: 'user-1', sessionId: 'session-1' },
        { cursor },
      ),
    ).rejects.toThrow('Invalid archive cursor')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('maps bulk archive inputs to the atomic RPC and returns camel-cased results', async () => {
    const id = draftId(1)
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id,
          archived_at: '2026-08-07T14:00:00.000Z',
          updated_at: '2026-08-07T14:00:00.000Z',
          changed: true,
        },
      ],
      error: null,
    })
    mocks.createClient.mockReturnValue({ rpc })

    const result = await bulkSetNewsletterDraftArchiveState(
      { ownerId: 'user-1', sessionId: 'session-1' },
      'archive',
      [{ id, expectedUpdatedAt: '2026-08-07T13:00:00.000Z' }],
      'archive-safe-key-123',
    )

    expect(rpc).toHaveBeenCalledWith(
      'bulk_set_newsletter_draft_archive_state',
      {
        p_owner_id: 'user-1',
        p_action: 'archive',
        p_items: [
          {
            id,
            expected_updated_at: '2026-08-07T13:00:00.000Z',
          },
        ],
        p_idempotency_key: 'archive-safe-key-123',
      },
    )
    expect(result).toEqual([
      {
        id,
        archivedAt: '2026-08-07T14:00:00.000Z',
        updatedAt: '2026-08-07T14:00:00.000Z',
        changed: true,
      },
    ])
  })

  it('maps an atomic bulk RPC version failure to a draft conflict', async () => {
    const id = draftId(2)
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'One or more drafts changed or are outside this scope' },
    })
    mocks.createClient.mockReturnValue({ rpc })

    await expect(
      bulkSetNewsletterDraftArchiveState(
        { ownerId: 'user-1', sessionId: 'session-1' },
        'restore',
        [{ id, expectedUpdatedAt: '2026-08-07T13:00:00.000Z' }],
        'restore-safe-key-123',
      ),
    ).rejects.toBeInstanceOf(NewsletterDraftConflictError)
  })
})
