import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

const draftMocks = vi.hoisted(() => ({
  appendNewsletterDraftEvent: vi.fn(),
  createNewsletterDraftFromDocument: vi.fn(),
  findNewsletterDraftBySourceReviewKey: vi.fn(),
  getNewsletterDraft: vi.fn(),
  listNewsletterDrafts: vi.fn(),
  saveNewsletterDraft: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}))

vi.mock('../drafts', () => draftMocks)

vi.mock('../chart-library', () => ({
  listNewsletterChartLibraryItems: vi.fn(),
  saveNewsletterChartLibraryItem: vi.fn(),
}))

vi.mock('@/lib/beehiiv/store', () => ({
  listBeehiivDeliveries: vi.fn().mockResolvedValue([]),
}))

import {
  __testOnly,
  finalizeNewsletterDailyItems,
} from '../daily-runs'

type ResolvedWriteError = { message: string } | null

interface TestDatabaseState {
  run: Record<string, unknown>
  item: Record<string, unknown>
  itemWriteResults: Array<{ error: ResolvedWriteError }>
  itemWrites: Array<{
    payload: Record<string, unknown>
    signal: AbortSignal | null
  }>
  runWrites: Array<Record<string, unknown>>
}

const timestamp = '2026-08-06T12:00:00.000Z'
const scope = { ownerId: null, sessionId: 'automation-session' }

function buildDraftDocument(valid = true) {
  return {
    ticker: 'AAPL',
    format: 'single_stock' as const,
    featuredTickers: ['AAPL'],
    generatedAt: timestamp,
    subjectLine: 'Apple earnings setup',
    introText: valid ? 'Apple reports results after the close.' : '',
    autoPickedStock: false,
    blocks: [
      {
        id: 'block-1',
        layoutId: 'chart_plus_commentary',
        templateId: 'daily_wiim_catalyst',
        selectionReason: 'Current Apple catalyst.',
        heading: 'Apple earnings are in focus',
        body: '<p>Apple reports results after the close.</p>',
        chartImageUrl:
          'https://example.supabase.co/storage/v1/object/public/newsletter-charts/immutable/aapl.png',
        chartAlt: 'Apple one-month price chart',
        chartExportUrl: 'https://charts.theintraday.com/tos/AAPL',
        chartSpec: {
          mode: 'price' as const,
          symbol: 'AAPL',
          range: '1m',
          interval: 'D',
          chartType: 'candles',
        },
        chartNeedsRegeneration: false,
      },
    ],
  }
}

function buildDraftRecord(valid = true) {
  const draft = buildDraftDocument(valid)
  return {
    id: 'draft-1',
    ownerId: null,
    sessionId: scope.sessionId,
    ticker: 'AAPL',
    status: 'review' as const,
    sourceType: 'generated' as const,
    sourceReviewKey: null,
    subjectLine: draft.subjectLine,
    draft,
    previewHtml: '<html></html>',
    beehiivUrl: null,
    publishedAt: null,
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function buildState(): TestDatabaseState {
  return {
    run: {
      id: 'run-1',
      market_date: '2026-08-06',
      status: 'generating',
      target_count: 1,
      source_wiim_run_id: 'wiim-1',
      source_generated_at: timestamp,
      selected_count: 1,
      generated_count: 1,
      ready_count: 0,
      attention_count: 0,
      failed_count: 0,
      error_message: null,
      metadata_json: {},
      started_at: timestamp,
      completed_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    item: {
      id: 'item-1',
      run_id: 'run-1',
      rank: 1,
      ticker: 'AAPL',
      status: 'generated',
      quality_band: 'strong',
      relevance_score: 90,
      confidence_score: 90,
      candidate_type: 'newsletter',
      state_label: 'new',
      move_percent: 2.5,
      reason_type: 'earnings',
      headline: 'Apple reports quarterly results after the close',
      summary_text: 'Apple reports quarterly results after the close.',
      key_fact: null,
      source_refs_json: [],
      candidate_json: { companyName: 'Apple Inc.' },
      draft_id: 'draft-1',
      draft_status: 'review',
      chart_id: 'chart-1',
      chart_image_url:
        'https://example.supabase.co/storage/v1/object/public/newsletter-charts/immutable/aapl.png',
      subject_line: 'Apple earnings setup',
      error_message: null,
      retry_count: 0,
      started_at: timestamp,
      completed_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    },
    itemWriteResults: [],
    itemWrites: [],
    runWrites: [],
  }
}

function createSupabaseStub(state: TestDatabaseState) {
  return {
    from(table: string) {
      let operation: 'select' | 'update' = 'select'
      let columns = '*'
      let payload: Record<string, unknown> = {}
      let signal: AbortSignal | null = null

      const resolveQuery = (single: boolean) => {
        if (operation === 'update') {
          if (table === 'newsletter_daily_run_items') {
            state.itemWrites.push({ payload, signal })
            const result = state.itemWriteResults.shift() ?? { error: null }
            if (!result.error) Object.assign(state.item, payload)
            return { data: null, error: result.error }
          }
          if (table === 'newsletter_daily_runs') {
            state.runWrites.push(payload)
            Object.assign(state.run, payload)
            return { data: null, error: null }
          }
        }

        if (table === 'newsletter_daily_runs') {
          return {
            data: single ? state.run : [state.run],
            error: null,
          }
        }
        if (table === 'newsletter_daily_run_items') {
          const rows =
            columns === 'status'
              ? [{ status: state.item.status }]
              : [state.item]
          return {
            data: single ? rows[0] ?? null : rows,
            error: null,
          }
        }
        throw new Error(`Unexpected test table: ${table}`)
      }

      const query: Record<string, unknown> & PromiseLike<unknown> = {
        select(value = '*') {
          columns = value
          return query
        },
        update(value: Record<string, unknown>) {
          operation = 'update'
          payload = value
          return query
        },
        eq() {
          return query
        },
        order() {
          return query
        },
        abortSignal(value: AbortSignal) {
          signal = value
          return query
        },
        maybeSingle() {
          return Promise.resolve(resolveQuery(true))
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(resolveQuery(false)).then(
            onfulfilled,
            onrejected,
          )
        },
      }
      return query
    },
  }
}

function mockDraft(valid = true) {
  const record = buildDraftRecord(valid)
  draftMocks.getNewsletterDraft.mockResolvedValue(record)
  draftMocks.listNewsletterDrafts.mockResolvedValue([
    {
      id: record.id,
      ticker: record.ticker,
      format: record.draft.format,
      featuredTickers: record.draft.featuredTickers,
      status: record.status,
      sourceType: record.sourceType,
      sourceReviewKey: null,
      subjectLine: record.subjectLine,
      beehiivUrl: null,
      publishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])
  draftMocks.saveNewsletterDraft.mockResolvedValue({
    ...record,
    status: 'ready',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

describe('daily newsletter item finalization durability', () => {
  it('turns a resolved ready-write error into retryable attention state', async () => {
    const state = buildState()
    const signal = new AbortController().signal
    state.itemWriteResults.push(
      { error: { message: 'ready write unavailable' } },
      { error: null },
    )
    supabaseMocks.createClient.mockReturnValue(createSupabaseStub(state))
    mockDraft(true)

    const result = await finalizeNewsletterDailyItems(
      scope,
      'run-1',
      undefined,
      { signal },
    )

    expect(result.status).toBe('partial')
    expect(result.items[0]).toMatchObject({
      status: 'needs_attention',
      retryCount: 0,
      errorMessage:
        'Failed to finalize newsletter item AAPL: ready write unavailable',
    })
    expect(
      __testOnly.canClaimDailyItem(
        result.items[0].status,
        result.items[0].retryCount,
        true,
      ),
    ).toBe(true)
    expect(state.itemWrites.map((write) => write.payload.status)).toEqual([
      'ready',
      'needs_attention',
    ])
    expect(state.itemWrites.every((write) => write.signal === signal)).toBe(true)
  })

  it('does not ignore a resolved readiness-attention write error', async () => {
    const state = buildState()
    state.itemWriteResults.push(
      { error: { message: 'attention write unavailable' } },
      { error: null },
    )
    supabaseMocks.createClient.mockReturnValue(createSupabaseStub(state))
    mockDraft(false)

    const result = await finalizeNewsletterDailyItems(scope, 'run-1')

    expect(result.status).toBe('partial')
    expect(result.items[0]).toMatchObject({
      status: 'needs_attention',
      errorMessage:
        'Failed to mark newsletter item AAPL as needing attention: attention write unavailable',
    })
    expect(draftMocks.saveNewsletterDraft).not.toHaveBeenCalled()
    expect(state.itemWrites.map((write) => write.payload.status)).toEqual([
      'needs_attention',
      'needs_attention',
    ])
  })

  it('rejects when both the primary and fallback writes resolve with errors', async () => {
    const state = buildState()
    state.itemWriteResults.push(
      { error: { message: 'ready write unavailable' } },
      { error: { message: 'fallback write unavailable' } },
    )
    supabaseMocks.createClient.mockReturnValue(createSupabaseStub(state))
    mockDraft(true)

    let failure: unknown
    try {
      await finalizeNewsletterDailyItems(scope, 'run-1')
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).message).toContain(
      'Failed to finalize newsletter item AAPL: ready write unavailable',
    )
    expect((failure as AggregateError).message).toContain(
      'Failed to persist newsletter item AAPL retry state: fallback write unavailable',
    )
    expect(
      (failure as AggregateError).errors.map((error) =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual([
      'Failed to finalize newsletter item AAPL: ready write unavailable',
      'fallback write unavailable',
    ])
    expect(state.item.status).toBe('generated')
    expect(state.runWrites).toHaveLength(0)
  })
})
