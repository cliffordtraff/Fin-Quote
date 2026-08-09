import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface QueryResult {
  data: Array<Record<string, unknown>> | null
  error: { message: string } | null
}

interface QueryTrace {
  table: string
  selected: string | null
  inFilter: { column: string; values: unknown[] } | null
  equalityFilters: Array<{ column: string; value: unknown }>
  orders: Array<{ column: string; options: unknown }>
  signal: AbortSignal | null
}

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  results: [] as QueryResult[],
  traces: [] as QueryTrace[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { listNewsletterDraftSummariesBySourceReviewKeys } from '@/lib/newsletter/draft-summary-read'

function buildRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    ticker: 'AAPL',
    status: 'draft',
    source_type: 'catalyst',
    source_review_key: `review-${id}`,
    beehiiv_url: null,
    published_at: null,
    archived_at: null,
    format: 'single_stock',
    featured_tickers: ['AAPL'],
    generated_at: '2026-08-06T12:00:00.000Z',
    block_count: 2,
    attached_chart_count: 1,
    subject_line: `Issue ${id}`,
    created_at: '2026-08-06T12:00:00.000Z',
    updated_at: '2026-08-06T12:00:00.000Z',
    ...overrides,
  }
}

function installSupabaseQueryStub() {
  mocks.from.mockImplementation((table: string) => {
    const trace: QueryTrace = {
      table,
      selected: null,
      inFilter: null,
      equalityFilters: [],
      orders: [],
      signal: null,
    }
    mocks.traces.push(trace)

    const query = {
      select(columns: string) {
        trace.selected = columns
        return query
      },
      in(column: string, values: unknown[]) {
        trace.inFilter = { column, values }
        return query
      },
      eq(column: string, value: unknown) {
        trace.equalityFilters.push({ column, value })
        return query
      },
      order(column: string, options: unknown) {
        trace.orders.push({ column, options })
        return query
      },
      abortSignal(signal: AbortSignal) {
        trace.signal = signal
        return query
      },
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?:
          | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ) {
        const result = mocks.results.shift() ?? { data: [], error: null }
        return Promise.resolve(result).then(onfulfilled, onrejected)
      },
    }
    return query
  })
  mocks.createClient.mockReturnValue({ from: mocks.from })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.results.length = 0
  mocks.traces.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  installSupabaseQueryStub()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lightweight newsletter draft-summary reads', () => {
  it('normalizes and chunks exact review keys under the authenticated owner scope', async () => {
    const reviewKeys = Array.from({ length: 101 }, (_, index) => `review-${index}`)
    mocks.results.push(
      {
        data: [
          buildRow('older', { source_review_key: 'review-0' }),
          buildRow('newer', {
            source_review_key: 'review-1',
            status: 'ready',
            updated_at: '2026-08-07T12:00:00.000Z',
          }),
        ],
        error: null,
      },
      { data: [], error: null },
    )

    const summaries =
      await listNewsletterDraftSummariesBySourceReviewKeys(
        { ownerId: 'owner-1' },
        [' ', ` ${reviewKeys[0]} `, ...reviewKeys, reviewKeys[100]!],
      )

    expect(summaries.map((summary) => summary.id)).toEqual([
      'newer',
      'older',
    ])
    expect(summaries[0]).toMatchObject({
      status: 'ready',
      sourceReviewKey: 'review-1',
      attachedChartCount: 1,
      subjectLine: 'Issue newer',
    })
    expect(mocks.traces).toHaveLength(2)
    expect(mocks.traces[0]?.inFilter).toEqual({
      column: 'source_review_key',
      values: reviewKeys.slice(0, 100),
    })
    expect(mocks.traces[1]?.inFilter).toEqual({
      column: 'source_review_key',
      values: reviewKeys.slice(100),
    })
    for (const trace of mocks.traces) {
      expect(trace.table).toBe('newsletter_drafts')
      expect(trace.equalityFilters).toEqual([
        { column: 'owner_id', value: 'owner-1' },
      ])
      expect(trace.orders).toEqual([
        { column: 'updated_at', options: { ascending: false } },
        { column: 'id', options: { ascending: false } },
      ])
      expect(trace.selected).not.toContain('draft_json')
      expect(trace.selected).not.toContain('preview_html')
      expect(trace.selected).not.toContain('session_id')
    }
  })

  it('returns before client creation for an empty key set', async () => {
    await expect(
      listNewsletterDraftSummariesBySourceReviewKeys(
        { ownerId: 'owner-1' },
        [' ', ''],
      ),
    ).resolves.toEqual([])

    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('passes cancellation to every query and preserves storage errors', async () => {
    const signal = new AbortController().signal
    mocks.results.push({
      data: null,
      error: { message: 'database unavailable' },
    })

    await expect(
      listNewsletterDraftSummariesBySourceReviewKeys(
        { ownerId: 'owner-1' },
        ['review-1'],
        signal,
      ),
    ).rejects.toThrow(
      'Failed to look up newsletter drafts: database unavailable',
    )
    expect(mocks.traces[0]?.signal).toBe(signal)

    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await expect(
      listNewsletterDraftSummariesBySourceReviewKeys(
        { ownerId: 'owner-1' },
        ['review-2'],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.traces).toHaveLength(1)
  })
})
