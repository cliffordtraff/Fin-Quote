import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteNewsletterChartLibraryItem,
  listNewsletterChartLibraryItems,
  updateNewsletterChartLibraryItem,
  type NewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'

const cleanupPaths = new Set<string>()

afterEach(() => {
  for (const path of cleanupPaths) {
    rmSync(path, { recursive: true, force: true })
  }
  cleanupPaths.clear()
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
