import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteNewsletterChartLibraryItem,
  listNewsletterChartLibraryItems,
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

function seedLocalChart(sessionId: string): NewsletterChartLibraryItem {
  const id = randomUUID()
  const sessionDir = resolve('.newsletter-chart-library', sessionId)
  const chart: NewsletterChartLibraryItem = {
    id,
    ownerId: null,
    sessionId,
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
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
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
    expect(renamed.chartSpec.title).toBe('Apple breakout setup')
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
