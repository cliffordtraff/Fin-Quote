import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
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

import {
  listNewsletterDraftSummariesByIds,
  listNewsletterDraftSummariesBySourceReviewKeys,
} from '@/lib/newsletter/drafts'

const createdSessionDirs: string[] = []

function buildRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    owner_id: 'owner-1',
    session_id: 'owner-session',
    ticker: 'AAPL',
    status: 'draft',
    source_type: 'catalyst',
    source_review_key: `review-${id}`,
    beehiiv_url: null,
    published_at: null,
    archived_at: null,
    format: 'single_stock',
    featured_tickers: ['AAPL'],
    ticker_symbols: ['AAPL'],
    generated_at: '2026-08-06T12:00:00.000Z',
    block_count: 2,
    attached_chart_count: 1,
    subject_line: `Issue ${id}`,
    preview_html: '<html></html>',
    created_at: '2026-08-06T12:00:00.000Z',
    updated_at: '2026-08-06T12:00:00.000Z',
    ...overrides,
  }
}

function writeLocalRow(
  sessionId: string,
  row: Record<string, unknown>,
) {
  const sessionDir = resolve('.newsletter-drafts', sessionId)
  if (!createdSessionDirs.includes(sessionDir)) createdSessionDirs.push(sessionDir)
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(
    resolve(sessionDir, `${String(row.id)}.json`),
    JSON.stringify(row, null, 2),
  )
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
      is(column: string, value: unknown) {
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
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
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
  for (const sessionDir of createdSessionDirs.splice(0)) {
    rmSync(sessionDir, { recursive: true, force: true })
  }
  vi.unstubAllEnvs()
})

describe('newsletter draft summary lookups', () => {
  it('reads only requested local IDs, preserves session scope, and keeps legacy ordering', async () => {
    const sessionId = `summary-lookup-${randomUUID()}`
    writeLocalRow(
      sessionId,
      buildRow('draft-old', {
        owner_id: null,
        session_id: sessionId,
        updated_at: '2026-08-06T12:00:00.000Z',
      }),
    )
    writeLocalRow(
      sessionId,
      buildRow('draft-new', {
        owner_id: null,
        session_id: sessionId,
        ticker: 'MSFT',
        featured_tickers: ['MSFT', 'NVDA'],
        subject_line: 'Newer requested issue',
        updated_at: '2026-08-07T12:00:00.000Z',
      }),
    )
    writeLocalRow(
      sessionId,
      buildRow('wrong-session', {
        owner_id: null,
        session_id: 'another-session',
      }),
    )

    const summaries = await listNewsletterDraftSummariesByIds(
      { ownerId: null, sessionId },
      [' draft-old ', 'draft-new', 'draft-new', 'wrong-session', 'missing'],
    )

    expect(summaries.map((summary) => summary.id)).toEqual([
      'draft-new',
      'draft-old',
    ])
    expect(summaries[0]).toMatchObject({
      ticker: 'MSFT',
      featuredTickers: ['MSFT', 'NVDA'],
      subjectLine: 'Newer requested issue',
      attachedChartCount: 1,
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('filters local summaries by the requested source-review keys', async () => {
    const sessionId = `summary-review-${randomUUID()}`
    writeLocalRow(
      sessionId,
      buildRow('wanted', {
        owner_id: null,
        session_id: sessionId,
        source_review_key: 'market:2026-08-07:AAPL',
      }),
    )
    writeLocalRow(
      sessionId,
      buildRow('unrelated', {
        owner_id: null,
        session_id: sessionId,
        source_review_key: 'market:2026-08-07:MSFT',
      }),
    )

    const summaries = await listNewsletterDraftSummariesBySourceReviewKeys(
      { ownerId: null, sessionId },
      [' market:2026-08-07:AAPL ', 'market:2026-08-07:AAPL'],
    )

    expect(summaries.map((summary) => summary.id)).toEqual(['wanted'])
    expect(summaries[0]?.sourceReviewKey).toBe('market:2026-08-07:AAPL')
  })

  it('uses a scoped, abortable Supabase IN query and returns stable summaries', async () => {
    const signal = new AbortController().signal
    mocks.results.push({
      data: [
        buildRow('draft-old'),
        buildRow('draft-new', {
          status: 'ready',
          updated_at: '2026-08-07T12:00:00.000Z',
        }),
      ],
      error: null,
    })

    const summaries = await listNewsletterDraftSummariesByIds(
      { ownerId: 'owner-1', sessionId: 'ignored-owner-session' },
      ['draft-old', 'draft-new', 'draft-old', ' '],
      signal,
    )

    expect(summaries.map((summary) => summary.id)).toEqual([
      'draft-new',
      'draft-old',
    ])
    expect(summaries[0]?.status).toBe('ready')
    expect(mocks.traces).toHaveLength(1)
    expect(mocks.traces[0]).toMatchObject({
      table: 'newsletter_drafts',
      inFilter: {
        column: 'id',
        values: ['draft-old', 'draft-new'],
      },
      equalityFilters: [{ column: 'owner_id', value: 'owner-1' }],
      signal,
    })
    expect(mocks.traces[0]?.selected).not.toContain('draft_json')
    expect(mocks.traces[0]?.orders).toEqual([
      { column: 'updated_at', options: { ascending: false } },
      { column: 'id', options: { ascending: false } },
    ])
  })

  it('queries exact source-review keys and chunks large lookups deterministically', async () => {
    const reviewKeys = Array.from({ length: 101 }, (_, index) => `review-${index}`)
    mocks.results.push(
      { data: [buildRow('match', { source_review_key: 'review-0' })], error: null },
      { data: [], error: null },
    )

    await listNewsletterDraftSummariesBySourceReviewKeys(
      { ownerId: 'owner-1', sessionId: 'owner-session' },
      reviewKeys,
    )

    expect(mocks.traces).toHaveLength(2)
    expect(mocks.traces[0]?.inFilter).toEqual({
      column: 'source_review_key',
      values: reviewKeys.slice(0, 100),
    })
    expect(mocks.traces[1]?.inFilter).toEqual({
      column: 'source_review_key',
      values: reviewKeys.slice(100),
    })
    expect(
      mocks.traces.every((trace) =>
        trace.equalityFilters.some(
          (filter) => filter.column === 'owner_id' && filter.value === 'owner-1',
        ),
      ),
    ).toBe(true)
  })

  it('honors pre-abort without touching storage and surfaces Supabase errors', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(
      listNewsletterDraftSummariesByIds(
        { ownerId: 'owner-1', sessionId: 'owner-session' },
        ['draft-1'],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.createClient).not.toHaveBeenCalled()

    mocks.results.push({
      data: null,
      error: { message: 'database unavailable' },
    })
    await expect(
      listNewsletterDraftSummariesByIds(
        { ownerId: 'owner-1', sessionId: 'owner-session' },
        ['draft-1'],
      ),
    ).rejects.toThrow(
      'Failed to look up newsletter drafts: database unavailable',
    )
  })
})
