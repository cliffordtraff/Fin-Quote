import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from '../daily-types'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  getNewsletterDailyRun: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

vi.mock('../daily-runs-read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../daily-runs-read')>()
  return {
    ...actual,
    getNewsletterDailyRun: mocks.getNewsletterDailyRun,
  }
})

import {
  __testOnly,
  buildNewsletterEditorialShortlistEntries,
  buildNewsletterEditorialShortlistPresentation,
  NewsletterEditorialShortlistConflictError,
  NewsletterEditorialShortlistValidationError,
  saveNewsletterEditorialShortlist,
} from '../editorial-shortlist'

type Row = Record<string, unknown>

function item(rank: number): NewsletterDailyRunItem {
  return {
    id: `item-${rank}`,
    runId: 'run-1',
    rank,
    ticker: `T${rank}`,
    status: 'ready',
    qualityBand: 'strong',
    relevanceScore: 100 - rank,
    confidenceScore: 90 - rank,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: rank,
    reasonType: 'earnings',
    headline: `Story ${rank}`,
    summaryText: `Summary ${rank}`,
    keyFact: null,
    sourceRefs: [{ kind: 'news', label: `Source ${rank}` }],
    candidateMetadata: {},
    draftId: `draft-${rank}`,
    draftStatus: 'ready',
    draftUpdatedAt: '2026-08-08T12:00:00.000Z',
    chartId: null,
    chartImageUrl: null,
    subjectLine: `Subject ${rank}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

function run(): NewsletterDailyRun {
  const items = [1, 2, 3, 4, 5, 6].map(item)
  return {
    id: 'run-1',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-1',
    sourceGeneratedAt: '2026-08-08T09:00:00.000Z',
    selectedCount: items.length,
    generatedCount: items.length,
    readyCount: items.length,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: null,
    metadata: {},
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
    items,
  }
}

function revisionRow(input: {
  id: string
  revision: number
  commandHash: string
  idempotencyKey: string
}): Row {
  return {
    id: input.id,
    run_id: 'run-1',
    revision: input.revision,
    algorithm_version: 'morning-shortlist-v1',
    baseline_fingerprint: 'a'.repeat(64),
    actor_id: 'owner-1',
    session_id: null,
    command_hash: input.commandHash,
    idempotency_key: input.idempotencyKey,
    request_payload: {},
    baseline_count: 5,
    selected_count: 5,
    created_at: `2026-08-08T12:0${input.revision}:00.000Z`,
  }
}

function entryRows(
  dailyRun: NewsletterDailyRun,
  revisionId: string,
): Row[] {
  const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
  return buildNewsletterEditorialShortlistEntries({
    run: dailyRun,
    presentation,
    selectedItemIds: presentation.baseline.itemIds,
  }).map((entry) => ({
    revision_id: revisionId,
    item_id: entry.itemId,
    baseline_position: entry.baselinePosition,
    selected_position: entry.selectedPosition,
    decision: entry.decision,
    reason_code: entry.reasonCode,
    note: entry.note,
    evidence_snapshot: entry.evidence,
    created_at: '2026-08-08T12:00:00.000Z',
  }))
}

function clientFor(input: {
  rows: Record<string, Row[]>
  rpcResult?: { data: Row[] | null; error: { message: string } | null }
}) {
  class Query {
    private filters: Array<[string, unknown]> = []

    constructor(private readonly table: string) {}

    select() { return this }
    order() { return this }
    limit() { return this }
    abortSignal() { return this }
    eq(column: string, value: unknown) {
      this.filters.push([column, value])
      return this
    }
    is(column: string, value: unknown) {
      this.filters.push([column, value])
      return this
    }
    private result() {
      const data = (input.rows[this.table] ?? []).filter((row) =>
        this.filters.every(([column, value]) => row[column] === value))
      return { data, error: null }
    }
    maybeSingle() {
      const result = this.result()
      return Promise.resolve({
        data: result.data[0] ?? null,
        error: null,
      })
    }
    then<TResult1 = { data: Row[]; error: null }>(
      onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    ) {
      return Promise.resolve(this.result()).then(onfulfilled)
    }
  }

  return {
    from(table: string) {
      return new Query(table)
    },
    rpc() {
      const result = input.rpcResult ?? { data: null, error: null }
      return {
        abortSignal() { return this },
        then<TResult1 = typeof result>(
          onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
        ) {
          return Promise.resolve(result).then(onfulfilled)
        },
      }
    },
  }
}

const scope = { ownerId: 'owner-1', sessionId: 'session-1' }

beforeEach(() => {
  mocks.createServiceRoleClient.mockReset()
  mocks.getNewsletterDailyRun.mockReset()
})

describe('editorial shortlist persistence semantics', () => {
  it('replays before live validation and returns a newer current head', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const selectedItemIds = presentation.baseline.itemIds
    const commandHash = __testOnly.commandHashForSave(scope, {
      runId: dailyRun.id,
      expectedRevision: 0,
      presentation: {
        ...presentation,
        catalog: [...presentation.catalog].sort((left, right) =>
          left.itemId.localeCompare(right.itemId)),
      },
      selectedItemIds,
      intents: [],
    })
    const first = revisionRow({
      id: 'revision-1',
      revision: 1,
      commandHash,
      idempotencyKey: 'command-1',
    })
    const second = revisionRow({
      id: 'revision-2',
      revision: 2,
      commandHash: 'b'.repeat(64),
      idempotencyKey: 'command-2',
    })
    mocks.createServiceRoleClient.mockReturnValue(clientFor({
      rows: {
        newsletter_editorial_shortlist_revisions: [first, second],
        newsletter_editorial_shortlist_entries: [
          ...entryRows(dailyRun, 'revision-1'),
          ...entryRows(dailyRun, 'revision-2'),
        ],
        newsletter_editorial_shortlist_heads: [{
          run_id: 'run-1',
          revision_id: 'revision-2',
          revision: 2,
        }],
        newsletter_daily_runs: [{ id: 'run-1', owner_id: 'owner-1' }],
      },
    }) as never)

    const result = await saveNewsletterEditorialShortlist(scope, {
      runId: 'run-1',
      expectedRevision: 0,
      presentation,
      selectedItemIds,
      intents: [],
      idempotencyKey: 'command-1',
    })

    expect(mocks.getNewsletterDailyRun).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      changed: false,
      receiptRevisionId: 'revision-1',
      isCurrent: false,
      shortlist: { id: 'revision-2', revision: 2 },
    })
  })

  it('rejects reuse of an idempotency key for another logical command', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    mocks.createServiceRoleClient.mockReturnValue(clientFor({
      rows: {
        newsletter_editorial_shortlist_revisions: [revisionRow({
          id: 'revision-1',
          revision: 1,
          commandHash: 'f'.repeat(64),
          idempotencyKey: 'command-1',
        })],
      },
    }) as never)

    await expect(saveNewsletterEditorialShortlist(scope, {
      runId: 'run-1',
      expectedRevision: 0,
      presentation,
      selectedItemIds: presentation.baseline.itemIds,
      intents: [],
      idempotencyKey: 'command-1',
    })).rejects.toBeInstanceOf(NewsletterEditorialShortlistValidationError)
    expect(mocks.getNewsletterDailyRun).not.toHaveBeenCalled()
  })

  it('maps commit-time evidence fencing to a recoverable conflict', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    mocks.getNewsletterDailyRun.mockResolvedValue(dailyRun)
    mocks.createServiceRoleClient.mockReturnValue(clientFor({
      rows: { newsletter_editorial_shortlist_revisions: [] },
      rpcResult: {
        data: null,
        error: {
          message: 'shortlist presentation conflict: one or more items changed after presentation',
        },
      },
    }) as never)

    await expect(saveNewsletterEditorialShortlist(scope, {
      runId: 'run-1',
      expectedRevision: 0,
      presentation,
      selectedItemIds: presentation.baseline.itemIds,
      intents: [],
      idempotencyKey: 'command-1',
    })).rejects.toBeInstanceOf(NewsletterEditorialShortlistConflictError)
  })
})
