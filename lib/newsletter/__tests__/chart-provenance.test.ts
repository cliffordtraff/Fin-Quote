import { basename, resolve } from 'node:path'
import { rmSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureChart: vi.fn(),
}))

vi.mock('@/lib/newsletter/capture', () => ({
  captureChart: mocks.captureChart,
}))

import {
  canonicalNewsletterChartScene,
  hashNewsletterChartScene,
  materializeNewsletterChartScene,
  NEWSLETTER_CHART_RENDERER_CONTRACT,
} from '@/lib/newsletter/chart-provenance'
import {
  deleteNewsletterChartLibraryItem,
  saveNewsletterChartLibraryItem,
} from '@/lib/newsletter/chart-library'
import type {
  FundamentalsNewsletterChartSpec,
  PriceNewsletterChartSpec,
} from '@/lib/newsletter/types'

const cleanupPaths = new Set<string>()

function validPng(): Buffer {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(1200, 16)
  bytes.writeUInt32BE(675, 20)
  return bytes
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-07T14:30:00.000Z'))
  mocks.captureChart.mockImplementation(
    async (_spec: unknown, options: { outputPath: string }) => {
      writeFileSync(options.outputPath, validPng())
      cleanupPaths.add(options.outputPath)
      return options.outputPath
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true })
  cleanupPaths.clear()
})

describe('newsletter chart provenance', () => {
  it('materializes a lightweight price scene once and keeps it stable at a later clock', () => {
    const lightweight: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'AAPL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      chartExportSpec: {
        symbol: 'AAPL',
        range: '1m',
        interval: 'D',
        chartType: 'candles',
      },
    }
    const first = materializeNewsletterChartScene(
      lightweight,
      '2026-08-07T14:30:00.000Z',
    ) as PriceNewsletterChartSpec
    expect(first.chartExportSpec?.viewportTimeRange).toBeTruthy()
    expect(first.chartExportSpec?.dataTimeRange).toBeTruthy()

    const reopened = materializeNewsletterChartScene(
      first,
      '2027-08-07T14:30:00.000Z',
    )
    expect(canonicalNewsletterChartScene(reopened)).toBe(
      canonicalNewsletterChartScene(first),
    )
    expect(hashNewsletterChartScene(reopened)).toBe(
      hashNewsletterChartScene(first),
    )
  })

  it('persists the exact materialized render scene beside the generated image', async () => {
    const sessionId = `provenance-${crypto.randomUUID()}`
    cleanupPaths.add(resolve('.newsletter-chart-library', sessionId))
    const item = await saveNewsletterChartLibraryItem(
      { ownerId: null, sessionId },
      {
        title: 'Apple breakout',
        chartExportSpec: {
          symbol: 'AAPL',
          range: '1m',
          interval: 'D',
          chartType: 'candles',
          theme: 'light',
        },
      },
      { chartBaseUrl: 'https://charts.example.com' },
    )

    expect(mocks.captureChart).toHaveBeenCalledWith(
      expect.objectContaining({
        chartExportSpec: expect.objectContaining({
          viewportTimeRange: expect.any(Object),
          dataTimeRange: expect.any(Object),
        }),
      }),
      expect.any(Object),
    )
    expect(item.capturedAt).toBe('2026-08-07T14:30:00.000Z')
    expect(item.rendererContract).toBe(NEWSLETTER_CHART_RENDERER_CONTRACT)
    expect(item.sceneHash).toBe(hashNewsletterChartScene(item.chartSpec))
    expect(item.imageSha256).toMatch(/^[0-9a-f]{64}$/)

    const imagePath = resolve('.newsletter-output', basename(item.chartImageUrl))
    cleanupPaths.add(imagePath)
    await deleteNewsletterChartLibraryItem(
      { ownerId: null, sessionId },
      item.id,
    )
    expect(() => writeFileSync(imagePath, validPng(), { flag: 'wx' })).toThrow()
  })

  it('validates an inferred company-name title before capture', async () => {
    await expect(saveNewsletterChartLibraryItem(
      {
        ownerId: null,
        sessionId: `oversized-title-${crypto.randomUUID()}`,
      },
      {
        chartExportSpec: {
          symbol: 'AAPL',
          companyName: 'x'.repeat(121),
        },
      },
      { chartBaseUrl: 'https://charts.example.com' },
    )).rejects.toThrow('Chart title must be 120 characters or fewer')

    expect(mocks.captureChart).not.toHaveBeenCalled()
  })

  it('keeps an exact fundamentals editor state instead of reconstructing defaults', () => {
    const editorState = {
      symbol: 'AAPL',
      compareSymbols: ['MSFT'],
      visibleMetrics: ['revenue', 'netIncome'],
      seriesTypes: { revenue: 'area', netIncome: 'line' },
      chartTitleLeft: 73,
      customFutureSetting: { enabled: true },
    }
    const scene: FundamentalsNewsletterChartSpec = {
      stocks: ['AAPL', 'MSFT'],
      metrics: ['revenue', 'netIncome'],
      periodType: 'annual',
      minYear: 2022,
      maxYear: 2026,
      showStockPrice: false,
      chartType: 'bar',
      showLabels: true,
      stacked: false,
      indexToZero: false,
      editorState,
    }

    const materialized = materializeNewsletterChartScene(
      scene,
      '2026-08-07T14:30:00.000Z',
    ) as FundamentalsNewsletterChartSpec
    expect(materialized.editorState).toEqual(editorState)
  })
})
