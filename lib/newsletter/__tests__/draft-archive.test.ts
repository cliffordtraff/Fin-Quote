import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bulkSetNewsletterDraftArchiveState,
  listNewsletterDraftArchivePage,
  NewsletterDraftArchiveValidationError,
  NewsletterDraftConflictError,
} from '@/lib/newsletter/drafts'
import type { NewsletterDraftArchiveQuery } from '@/lib/newsletter/types'

const cleanupPaths = new Set<string>()

afterEach(() => {
  for (const path of cleanupPaths) {
    rmSync(path, { recursive: true, force: true })
  }
  cleanupPaths.clear()
  vi.restoreAllMocks()
})

function seedArchive(sessionId: string, count: number) {
  const directory = resolve('.newsletter-drafts', sessionId)
  mkdirSync(directory, { recursive: true })
  cleanupPaths.add(directory)
  const statuses = ['draft', 'review', 'ready', 'published'] as const
  const tickers = ['AAPL', 'MSFT', 'NVDA', 'MARKET']

  for (let index = 0; index < count; index += 1) {
    const id = `d0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    const ticker = tickers[index % tickers.length]!
    const generatedAt = new Date(
      Date.UTC(2026, 0, 1 + Math.floor(index / 55)),
    ).toISOString()
    const updatedAt = new Date(
      Date.UTC(2026, 1, 1, 0, 0, index % 55),
    ).toISOString()
    const featuredTickers = ticker === 'MARKET' ? ['AAPL', 'NVDA'] : [ticker]
    const status =
      statuses[(index * 3 + Math.floor(index / 4)) % statuses.length]!
    const publication =
      status === 'published'
        ? {
            beehiivUrl: `https://theintraday.beehiiv.com/p/${id}`,
            publishedAt: updatedAt,
          }
        : undefined
    const draft = {
      ticker,
      format: ticker === 'MARKET' ? 'market_roundup' : 'single_stock',
      featuredTickers,
      manualDraft: true,
      publication,
      generatedAt,
      subjectLine: `${ticker} issue ${index}`,
      introText: `Issue ${index}`,
      autoPickedStock: false,
      blocks: [],
    }
    const row = {
      id,
      owner_id: null,
      session_id: sessionId,
      ticker,
      status,
      source_type: 'manual',
      source_review_key: null,
      beehiiv_url: publication?.beehiivUrl ?? null,
      published_at: publication?.publishedAt ?? null,
      archived_at: index % 7 === 0 ? updatedAt : null,
      format: draft.format,
      featured_tickers: featuredTickers,
      ticker_symbols: [...new Set([ticker, ...featuredTickers])],
      generated_at: generatedAt,
      block_count: 0,
      attached_chart_count: 0,
      subject_line: draft.subjectLine,
      preview_html: '<html></html>',
      draft_json: draft,
      history: [],
      created_at: generatedAt,
      updated_at: updatedAt,
    }
    writeFileSync(
      resolve(directory, `${id}.json`),
      JSON.stringify(row),
    )
  }

  return directory
}

describe('newsletter draft archive', () => {
  it('paginates hundreds of tied issue dates without gaps or duplicates', async () => {
    const sessionId = `archive-scale-${crypto.randomUUID()}`
    seedArchive(sessionId, 257)
    const scope = { ownerId: null, sessionId }
    const ids: string[] = []
    let cursor: string | undefined

    do {
      const page = await listNewsletterDraftArchivePage(scope, {
        visibility: 'all',
        pageSize: 50,
        cursor,
      })
      expect(page.drafts.length).toBeLessThanOrEqual(50)
      expect(page.total).toBe(257)
      ids.push(...page.drafts.map((draft) => draft.id))
      cursor = page.nextCursor ?? undefined
      expect(page.hasMore).toBe(Boolean(cursor))
    } while (cursor)

    expect(ids).toHaveLength(257)
    expect(new Set(ids).size).toBe(257)
    expect(ids).toEqual(
      [...ids].sort((left, right) => {
        const leftIndex = Number(left.slice(-4))
        const rightIndex = Number(right.slice(-4))
        const leftDay = Math.floor(leftIndex / 55)
        const rightDay = Math.floor(rightIndex / 55)
        return rightDay - leftDay || right.localeCompare(left)
      }),
    )
  })

  it('combines search, featured ticker, status, issue dates, and visibility with global facets', async () => {
    const sessionId = `archive-filters-${crypto.randomUUID()}`
    seedArchive(sessionId, 120)
    const page = await listNewsletterDraftArchivePage(
      { ownerId: null, sessionId },
      {
        search: 'MARKET issue',
        ticker: 'NVDA',
        status: 'published',
        from: '2026-01-01',
        to: '2026-01-03',
        visibility: 'active',
        pageSize: 100,
      },
    )

    expect(page.drafts.length).toBeGreaterThan(0)
    expect(page.drafts.every((draft) => draft.status === 'published')).toBe(true)
    expect(page.drafts.every((draft) => draft.ticker === 'MARKET')).toBe(true)
    expect(page.drafts.every((draft) => !draft.archivedAt)).toBe(true)
    expect(page.facets.statuses.published).toBe(page.total)
    expect(page.facets.statuses.draft).toBeGreaterThan(0)
    expect(page.facets.archived).toBeGreaterThan(0)
  })

  it('archives and restores atomically without changing issue, publication, or chart data', async () => {
    const sessionId = `archive-mutation-${crypto.randomUUID()}`
    const directory = seedArchive(sessionId, 4)
    const scope = { ownerId: null, sessionId }
    const active = await listNewsletterDraftArchivePage(scope, {
      visibility: 'active',
      pageSize: 10,
    })
    const selected = active.drafts.slice(0, 2)
    const before = selected.map((draft) =>
      JSON.parse(
        readFileSync(resolve(directory, `${draft.id}.json`), 'utf8'),
      ),
    )

    const archiveKey = `archive-${crypto.randomUUID()}`
    const archiveItems = selected.map((draft) => ({
      id: draft.id,
      expectedUpdatedAt: draft.updatedAt,
    }))
    const archived = await bulkSetNewsletterDraftArchiveState(
      scope,
      'archive',
      archiveItems,
      archiveKey,
    )
    expect(archived.every((result) => result.changed && result.archivedAt)).toBe(true)

    const afterArchive = selected.map((draft) =>
      JSON.parse(
        readFileSync(resolve(directory, `${draft.id}.json`), 'utf8'),
      ),
    )
    afterArchive.forEach((row, index) => {
      expect(row.draft_json).toEqual(before[index].draft_json)
      expect(row.status).toBe(before[index].status)
      expect(row.beehiiv_url).toBe(before[index].beehiiv_url)
      expect(row.published_at).toBe(before[index].published_at)
      expect(row.history.at(-1)?.type).toBe('archived')
    })

    const replay = await bulkSetNewsletterDraftArchiveState(
      scope,
      'archive',
      archiveItems,
      archiveKey,
    )
    expect(replay.every((result) => !result.changed)).toBe(true)
    selected.forEach((draft) => {
      const row = JSON.parse(
        readFileSync(resolve(directory, `${draft.id}.json`), 'utf8'),
      )
      expect(
        row.history.filter(
          (event: { metadata?: { idempotencyKey?: string } }) =>
            event.metadata?.idempotencyKey === archiveKey,
        ),
      ).toHaveLength(1)
    })

    const restored = await bulkSetNewsletterDraftArchiveState(
      scope,
      'restore',
      archived.map((result) => ({
        id: result.id,
        expectedUpdatedAt: result.updatedAt,
      })),
      `restore-${crypto.randomUUID()}`,
    )
    expect(restored.every((result) => result.changed && !result.archivedAt)).toBe(true)
  })

  it('rejects an invalid draft UUID before touching local archive storage', async () => {
    await expect(
      bulkSetNewsletterDraftArchiveState(
        { ownerId: null, sessionId: `archive-invalid-${crypto.randomUUID()}` },
        'archive',
        [
          {
            id: 'not-a-draft-uuid',
            expectedUpdatedAt: '2026-08-07T11:00:00.000Z',
          },
        ],
        'archive-valid-key',
      ),
    ).rejects.toThrow('unique valid draft IDs')
  })

  it('leaves every local row unchanged when one bulk archive version conflicts', async () => {
    const sessionId = `archive-conflict-${crypto.randomUUID()}`
    const directory = seedArchive(sessionId, 4)
    const scope = { ownerId: null, sessionId }
    const active = await listNewsletterDraftArchivePage(scope, {
      visibility: 'active',
      pageSize: 10,
    })
    const selected = active.drafts.slice(0, 2)
    const idempotencyKey = `archive-${crypto.randomUUID()}`

    await expect(
      bulkSetNewsletterDraftArchiveState(
        scope,
        'archive',
        selected.map((draft, index) => ({
          id: draft.id,
          expectedUpdatedAt:
            index === 0
              ? draft.updatedAt
              : '2000-01-01T00:00:00.000Z',
        })),
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(NewsletterDraftConflictError)

    for (const draft of selected) {
      const row = JSON.parse(
        readFileSync(resolve(directory, `${draft.id}.json`), 'utf8'),
      )
      expect(row.archived_at).toBeNull()
      expect(
        row.history.some(
          (event: { metadata?: { idempotencyKey?: string } }) =>
            event.metadata?.idempotencyKey === idempotencyKey,
        ),
      ).toBe(false)
    }
  })

  it('skips a corrupt local record and honors cancellation', async () => {
    const sessionId = `archive-corrupt-${crypto.randomUUID()}`
    const directory = seedArchive(sessionId, 3)
    writeFileSync(resolve(directory, 'corrupt.json'), '{not-json')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const page = await listNewsletterDraftArchivePage(
      { ownerId: null, sessionId },
      { visibility: 'all' },
    )
    expect(page.total).toBe(3)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unreadable local draft'),
      expect.anything(),
    )

    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      listNewsletterDraftArchivePage(
        { ownerId: null, sessionId },
        {},
        controller.signal,
      ),
    ).rejects.toThrow('cancelled')
  })

  it.each<{
    label: string
    query: NewsletterDraftArchiveQuery
  }>([
    { label: 'oversized search', query: { search: 'x'.repeat(121) } },
    {
      label: 'unknown status',
      query: { status: 'deleted' as NewsletterDraftArchiveQuery['status'] },
    },
    { label: 'unsafe ticker', query: { ticker: 'AAPL,*' } },
    { label: 'impossible date', query: { from: '2026-02-30' } },
    {
      label: 'reversed date range',
      query: { from: '2026-08-08', to: '2026-08-07' },
    },
    { label: 'malformed cursor', query: { cursor: 'not-a-cursor!' } },
    {
      label: 'non-canonical cursor timestamp',
      query: {
        cursor: Buffer.from(
          JSON.stringify({
            generatedAt: 'Fri, 07 Aug 2026 12:00:00 GMT',
            id: 'draft-1',
          }),
          'utf8',
        ).toString('base64url'),
      },
    },
    {
      label: 'non-UUID cursor id',
      query: {
        cursor: Buffer.from(
          JSON.stringify({
            generatedAt: '2026-08-07T12:00:00.000Z',
            id: 'draft-1',
          }),
          'utf8',
        ).toString('base64url'),
      },
    },
    { label: 'zero page size', query: { pageSize: 0 } },
  ])('rejects $label before querying storage', async ({ query }) => {
    await expect(
      listNewsletterDraftArchivePage(
        { ownerId: null, sessionId: `archive-invalid-${crypto.randomUUID()}` },
        query,
      ),
    ).rejects.toBeInstanceOf(NewsletterDraftArchiveValidationError)
  })

  it('caps oversized pages at the documented server maximum', async () => {
    const page = await listNewsletterDraftArchivePage(
      { ownerId: null, sessionId: `archive-limit-${crypto.randomUUID()}` },
      { pageSize: 10_000 },
    )
    expect(page.pageSize).toBe(100)
  })
})
