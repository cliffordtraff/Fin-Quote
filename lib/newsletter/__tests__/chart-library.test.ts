import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __testOnly,
  deleteNewsletterChartLibraryItem,
  listNewsletterChartLibraryItems,
  listNewsletterChartLibrarySummaries,
  uploadNewsletterChartImage,
  updateNewsletterChartLibraryItem,
  type NewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'

const cleanupPaths = new Set<string>()

afterEach(() => {
  for (const path of cleanupPaths) {
    rmSync(path, { recursive: true, force: true })
  }
  cleanupPaths.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function seedLocalChart(
  sessionId: string,
  overrides: Partial<NewsletterChartLibraryItem> = {},
): NewsletterChartLibraryItem {
  const id = overrides.id ?? randomUUID()
  const sessionDir = resolve('.newsletter-chart-library', sessionId)
  const chart: NewsletterChartLibraryItem = {
    title: 'AAPL six month trend',
    symbol: 'AAPL',
    chartSpec: {
      mode: 'price',
      symbol: 'AAPL',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
      title: 'AAPL six month trend',
    },
    chartImageUrl: 'https://cdn.example.com/aapl.png',
    thumbnailUrl: 'https://cdn.example.com/aapl.png',
    chartExportUrl: 'https://charts.example.com/tos/AAPL?view=price',
    capturedAt: '2026-07-28T12:00:00.000Z',
    rendererContract: 'the-intraday-newsletter-chart/v1',
    sceneHash: 'a'.repeat(64),
    imageSha256: 'b'.repeat(64),
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    ...overrides,
    id,
    ownerId: null,
    sessionId,
  }

  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(resolve(sessionDir, `${id}.json`), JSON.stringify(chart, null, 2))
  cleanupPaths.add(sessionDir)
  return chart
}

describe('newsletter chart library local storage', () => {
  it('lists and renames charts within the active anonymous session', async () => {
    const sessionId = `chart-test-${randomUUID()}`
    const seeded = seedLocalChart(sessionId)
    const scope = { ownerId: null, sessionId }

    expect(await listNewsletterChartLibraryItems(scope)).toEqual([seeded])

    const renamed = await updateNewsletterChartLibraryItem(scope, seeded.id, {
      title: 'Apple breakout setup',
    })

    expect(renamed.title).toBe('Apple breakout setup')
    expect(renamed.chartSpec).toEqual(seeded.chartSpec)
    expect(renamed.sceneHash).toBe(seeded.sceneHash)
    expect((await listNewsletterChartLibraryItems(scope))[0]?.title).toBe(
      'Apple breakout setup',
    )
  })

  it('deletes a chart without crossing session boundaries', async () => {
    const sessionId = `chart-test-${randomUUID()}`
    const seeded = seedLocalChart(sessionId)
    const scope = { ownerId: null, sessionId }

    await expect(
      deleteNewsletterChartLibraryItem(
        { ownerId: null, sessionId: 'different-session' },
        seeded.id,
      ),
    ).rejects.toThrow('not found')

    await deleteNewsletterChartLibraryItem(scope, seeded.id)
    expect(await listNewsletterChartLibraryItems(scope)).toEqual([])
  })

  it('rejects empty and oversized chart titles', async () => {
    const sessionId = `chart-test-${randomUUID()}`
    const seeded = seedLocalChart(sessionId)
    const scope = { ownerId: null, sessionId }

    await expect(
      updateNewsletterChartLibraryItem(scope, seeded.id, { title: '   ' }),
    ).rejects.toThrow('Chart title is required')
    await expect(
      updateNewsletterChartLibraryItem(scope, seeded.id, {
        title: 'x'.repeat(121),
      }),
    ).rejects.toThrow('120 characters or fewer')
  })

  it('pages tied timestamps deterministically without duplicate rows', async () => {
    const sessionId = `chart-page-test-${randomUUID()}`
    const tiedAt = '2026-08-08T12:34:56.123456Z'
    const ids = [1, 2, 3, 4, 5].map(
      (value) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`,
    )
    for (const [index, id] of ids.entries()) {
      seedLocalChart(sessionId, {
        id,
        title: `Chart ${index + 1}`,
        symbol: index % 2 === 0 ? 'AAPL' : 'MSFT',
        capturedAt: tiedAt,
        createdAt: tiedAt,
        updatedAt: tiedAt,
      })
    }

    const scope = { ownerId: null, sessionId }
    const first = await listNewsletterChartLibrarySummaries(scope, { limit: 2 })
    const second = await listNewsletterChartLibrarySummaries(scope, {
      limit: 2,
      cursor: first.nextCursor,
    })
    const third = await listNewsletterChartLibrarySummaries(scope, {
      limit: 2,
      cursor: second.nextCursor,
    })

    expect(first.charts.map((chart) => chart.id)).toEqual([ids[4], ids[3]])
    expect(second.charts.map((chart) => chart.id)).toEqual([ids[2], ids[1]])
    expect(third.charts.map((chart) => chart.id)).toEqual([ids[0]])
    expect(new Set([...first.charts, ...second.charts, ...third.charts].map(
      (chart) => chart.id,
    )).size).toBe(5)
    expect(first.total).toBe(5)
    expect(third.nextCursor).toBeNull()
  })

  it('keeps cursor microseconds exact and scopes summary filters to one session', async () => {
    const updatedAt = '2026-08-08T12:34:56.654321+00:00'
    const id = '20000000-0000-4000-8000-000000000001'
    const cursor = __testOnly.encodeLibraryCursor({ id, updatedAt })
    expect(__testOnly.decodeLibraryCursor(cursor)).toEqual({ id, updatedAt })

    const sessionId = `chart-filter-test-${randomUUID()}`
    seedLocalChart(sessionId, {
      id,
      title: 'Apple earnings breakout',
      symbol: 'AAPL',
      updatedAt,
    })
    seedLocalChart(sessionId, {
      id: '20000000-0000-4000-8000-000000000002',
      title: 'Microsoft cloud trend',
      symbol: 'MSFT',
    })
    seedLocalChart(`other-${sessionId}`, {
      id: '20000000-0000-4000-8000-000000000003',
      title: 'Apple cross-session chart',
      symbol: 'AAPL',
    })

    const page = await listNewsletterChartLibrarySummaries(
      { ownerId: null, sessionId },
      { query: 'earnings', symbol: 'aapl', limit: 10 },
    )
    expect(page.charts.map((chart) => chart.id)).toEqual([id])
    expect(page.total).toBe(1)
    expect(__testOnly.summarySelect).not.toContain('chart_spec,')
    expect(__testOnly.summarySelect).not.toContain('image_path')
  })

  it('rejects malformed or oversized cursors before reading local chart files', async () => {
    const scope = { ownerId: null, sessionId: `chart-cursor-test-${randomUUID()}` }
    await expect(
      listNewsletterChartLibrarySummaries(scope, { cursor: 'not+a+cursor' }),
    ).rejects.toThrow('cursor is invalid')
    await expect(
      listNewsletterChartLibrarySummaries(scope, { cursor: 'a'.repeat(513) }),
    ).rejects.toThrow('cursor is invalid')
  })
})

describe('newsletter chart library upload cancellation', () => {
  it('passes caller cancellation through to the Supabase Storage fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key')

    const fixtureDir = resolve('.newsletter-chart-library', `upload-test-${randomUUID()}`)
    const outputPath = resolve(fixtureDir, 'chart.png')
    const pngHeader = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader)
    pngHeader.writeUInt32BE(1, 16)
    pngHeader.writeUInt32BE(1, 20)
    mkdirSync(fixtureDir, { recursive: true })
    writeFileSync(outputPath, pngHeader)
    cleanupPaths.add(fixtureDir)

    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    let storageFetchSignal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      storageFetchSignal = init?.signal
      markFetchStarted?.()
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        const rejectAbort = () => reject(signal.reason)
        if (signal.aborted) rejectAbort()
        else signal.addEventListener('abort', rejectAbort, { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const reason = new Error('chart stage lease expired')
    const upload = uploadNewsletterChartImage({
      ownerId: randomUUID(),
      chartId: randomUUID(),
      symbol: 'AAPL',
      outputPath,
      signal: controller.signal,
    })

    await fetchStarted
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(storageFetchSignal).toBeDefined()
    controller.abort(reason)

    await expect(upload).rejects.toBe(reason)
    expect(storageFetchSignal?.aborted).toBe(true)
    expect(storageFetchSignal?.reason).toBe(reason)
  })
})
