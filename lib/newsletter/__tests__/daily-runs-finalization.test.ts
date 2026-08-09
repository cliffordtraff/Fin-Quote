import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

const draftMocks = vi.hoisted(() => ({
  appendNewsletterDraftEvent: vi.fn(),
  createNewsletterDraftFromDocument: vi.fn(),
  findNewsletterDraftBySourceReviewKey: vi.fn(),
  getNewsletterDraft: vi.fn(),
  listNewsletterDraftSummariesByIds: vi.fn(),
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
import {
  buildNewsletterChartProvenance,
  materializeNewsletterChartScene,
} from '../chart-provenance'
import type { NewsletterDraftDocument } from '../types'

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
  const chartImageUrl =
    'https://example.supabase.co/storage/v1/object/public/newsletter-charts/immutable/aapl.png'
  const chartExportUrl = 'https://charts.theintraday.com/tos/AAPL'
  const chartSpec = materializeNewsletterChartScene(
    {
      mode: 'price' as const,
      symbol: 'AAPL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
    },
    timestamp,
  )
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
        chartImageUrl,
        chartAlt: 'Apple one-month price chart',
        chartExportUrl,
        chartSpec,
        chartProvenance: buildNewsletterChartProvenance({
          source: 'automation',
          capturedAt: timestamp,
          imageUrl: chartImageUrl,
          interactiveUrl: chartExportUrl,
          scene: chartSpec,
        }),
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
            return {
              data:
                single && columns === 'id'
                  ? { id: state.item.id }
                  : null,
              error: result.error,
            }
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
        limit() {
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
  draftMocks.listNewsletterDraftSummariesByIds.mockResolvedValue([
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
  it('repairs the linked retry draft in place and preserves edited copy', async () => {
    const state = buildState()
    const claimStartedAt = '2026-08-06T12:15:00.000Z'
    state.item = {
      ...state.item,
      status: 'generating',
      draft_id: 'draft-1',
      started_at: claimStartedAt,
    }
    supabaseMocks.createClient.mockReturnValue(createSupabaseStub(state))

    const currentChartBlock = buildDraftDocument(true).blocks[0]
    const prior = {
      ...buildDraftRecord(true),
      status: 'ready' as const,
      draft: buildDraftDocument(true) as NewsletterDraftDocument,
    }
    prior.subjectLine = 'Editor revised subject'
    prior.draft = {
      ...prior.draft,
      subjectLine: prior.subjectLine,
      source: {
        type: 'daily_batch',
        dailyBatch: {
          runId: 'run-1',
          itemId: 'item-1',
          itemKey: 'daily:run-1:AAPL:prior-attempt',
          sourceWiimRunId: 'wiim-1',
          marketDate: '2026-08-06',
          rank: 1,
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          headline: 'Apple reports quarterly results after the close',
          summary: 'Apple reports quarterly results after the close.',
          keyFact: null,
          reasonType: 'earnings',
          movePercent: 2.5,
          confidenceScore: 90,
          relevanceScore: 90,
          qualityBand: 'strong',
          sourceRefs: [],
        },
        attachedChartIds: [],
        automatedAt: timestamp,
        automationStatus: 'complete',
      },
      blocks: prior.draft.blocks.map((block) => ({
        ...block,
        heading: 'Editor retained heading',
        body: '<p>Editor retained analysis.</p>',
        chartProvenance: block.chartProvenance
          ? {
              ...block.chartProvenance,
              source: 'legacy' as const,
              rendererContract: 'legacy-reconstructed-v0',
            }
          : undefined,
        chartNeedsRegeneration: false,
      })),
    } as NewsletterDraftDocument
    draftMocks.getNewsletterDraft.mockResolvedValue(prior)
    draftMocks.findNewsletterDraftBySourceReviewKey.mockResolvedValue(null)
    draftMocks.saveNewsletterDraft.mockImplementation(
      async (_scope, id, document) => ({
        ...prior,
        id,
        subjectLine: document.subjectLine,
        draft: document,
        updatedAt: '2026-08-06T12:16:00.000Z',
      }),
    )
    draftMocks.appendNewsletterDraftEvent.mockResolvedValue(undefined)

    const chart = {
      id: 'repaired-chart',
      ownerId: null,
      sessionId: scope.sessionId,
      title: 'AAPL repaired chart',
      symbol: 'AAPL',
      chartSpec: currentChartBlock.chartSpec,
      chartImageUrl: currentChartBlock.chartImageUrl,
      thumbnailUrl: currentChartBlock.chartImageUrl,
      chartExportUrl: currentChartBlock.chartExportUrl,
      capturedAt: currentChartBlock.chartProvenance?.capturedAt ?? timestamp,
      rendererContract:
        currentChartBlock.chartProvenance?.rendererContract ?? '',
      sceneHash: currentChartBlock.chartProvenance?.sceneSha256 ?? '',
      imageSha256: currentChartBlock.chartProvenance?.imageSha256 ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const item = {
      ...__testOnly.mapItemRow(state.item as never),
      status: 'needs_attention' as const,
      completedAt: timestamp,
      errorMessage: 'Capture a final chart.',
    }
    const run = __testOnly.mapRunRow(state.run as never, [item])

    const result = await __testOnly.processDailyItem(
      scope,
      run,
      item,
      new Map([['AAPL', chart as never]]),
      { retryFailed: true, publicChartBaseUrl: 'https://charts.theintraday.com' },
      {},
    )

    expect(result).toBe('generated')
    expect(draftMocks.getNewsletterDraft).toHaveBeenCalledWith(
      scope,
      'draft-1',
      { signal: undefined },
    )
    expect(draftMocks.createNewsletterDraftFromDocument).not.toHaveBeenCalled()
    expect(draftMocks.saveNewsletterDraft).toHaveBeenCalledWith(
      scope,
      'draft-1',
      expect.objectContaining({
        subjectLine: 'Editor revised subject',
        blocks: [
          expect.objectContaining({
            heading: 'Editor retained heading',
            body: '<p>Editor retained analysis.</p>',
            chartNeedsRegeneration: false,
            chartProvenance: expect.objectContaining({
              libraryItemId: 'repaired-chart',
            }),
          }),
        ],
      }),
      'review',
      expect.objectContaining({ expectedUpdatedAt: prior.updatedAt }),
    )
    expect(state.item.draft_id).toBe('draft-1')
  })

  it('creates a replacement instead of overwriting a source-quarantined linked draft', async () => {
    const state = buildState()
    const claimStartedAt = '2026-08-06T12:20:00.000Z'
    state.item = {
      ...state.item,
      status: 'generating',
      draft_id: 'draft-unsafe',
      started_at: claimStartedAt,
      candidate_json: {
        companyName: 'Apple Inc.',
        newsletterSourceRefreshedAt: '2026-08-06T12:19:00.000Z',
      },
    }
    supabaseMocks.createClient.mockReturnValue(createSupabaseStub(state))

    const replacement = buildDraftRecord(true)
    replacement.id = 'draft-replacement'
    replacement.updatedAt = '2026-08-06T12:21:00.000Z'
    draftMocks.createNewsletterDraftFromDocument.mockResolvedValue(replacement)
    draftMocks.appendNewsletterDraftEvent.mockResolvedValue(undefined)

    const block = replacement.draft.blocks[0]
    const chart = {
      id: 'replacement-chart',
      ownerId: null,
      sessionId: scope.sessionId,
      title: 'AAPL replacement chart',
      symbol: 'AAPL',
      chartSpec: block.chartSpec,
      chartImageUrl: block.chartImageUrl,
      thumbnailUrl: block.chartImageUrl,
      chartExportUrl: block.chartExportUrl,
      capturedAt: block.chartProvenance?.capturedAt ?? timestamp,
      rendererContract: block.chartProvenance?.rendererContract ?? '',
      sceneHash: block.chartProvenance?.sceneSha256 ?? '',
      imageSha256: block.chartProvenance?.imageSha256 ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const item = {
      ...__testOnly.mapItemRow(state.item as never),
      status: 'needs_attention' as const,
      completedAt: timestamp,
      errorMessage: 'Source entity mismatch.',
    }
    const run = __testOnly.mapRunRow(state.run as never, [item])

    const result = await __testOnly.processDailyItem(
      scope,
      run,
      item,
      new Map([['AAPL', chart as never]]),
      { retryFailed: true, publicChartBaseUrl: 'https://charts.theintraday.com' },
      {},
    )

    expect(result).toBe('generated')
    expect(draftMocks.getNewsletterDraft).not.toHaveBeenCalled()
    expect(draftMocks.saveNewsletterDraft).not.toHaveBeenCalled()
    expect(draftMocks.createNewsletterDraftFromDocument).toHaveBeenCalledOnce()
    expect(state.item.draft_id).toBe('draft-replacement')
  })

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
