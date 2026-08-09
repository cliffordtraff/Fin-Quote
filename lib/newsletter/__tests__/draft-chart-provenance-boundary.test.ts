import { rmSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureChart: vi.fn(),
  getLibraryItem: vi.fn(),
}))

vi.mock('../capture', () => ({
  captureChart: mocks.captureChart,
}))

vi.mock('../chart-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chart-library')>()
  return {
    ...actual,
    getNewsletterChartLibraryItem: mocks.getLibraryItem,
  }
})

import {
  createNewsletterDraftFromDocument,
  normalizeNewsletterDraftDocument,
  reconcileNewsletterDraftClientCharts,
  regenerateNewsletterDraftChart,
} from '../drafts'
import {
  buildNewsletterChartProvenance,
  isNewsletterChartProvenanceCurrent,
  materializeNewsletterChartScene,
} from '../chart-provenance'
import type {
  NewsletterDraftDocument,
  PriceNewsletterChartSpec,
} from '../types'
import type { NewsletterChartLibraryItem } from '../chart-library'
import { NewsletterCapturePathError } from '../capture-output-path'

const CAPTURED_AT = '2026-08-07T14:30:00.000Z'
const PUBLIC_CHART_BASE_URL = 'https://charts.theintraday.com'
const INTERACTIVE_URL = `${PUBLIC_CHART_BASE_URL}/chart?symbol=AAPL`
const IMAGE_DIGEST = 'a'.repeat(64)
const IMAGE_URL = `https://cdn.example.com/immutable/aa/${IMAGE_DIGEST}.png`

function scene(title = 'Apple price'): PriceNewsletterChartSpec {
  return materializeNewsletterChartScene(
    {
      mode: 'price',
      symbol: 'AAPL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      title,
    },
    CAPTURED_AT,
  ) as PriceNewsletterChartSpec
}

function document(): NewsletterDraftDocument {
  const chartSpec = scene()
  return {
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: ['AAPL'],
    generatedAt: CAPTURED_AT,
    subjectLine: 'Apple update',
    introText: 'Apple moved after earnings.',
    autoPickedStock: false,
    blocks: [
      {
        id: 'block-1',
        layoutId: 'chart_plus_commentary',
        templateId: 'price',
        selectionReason: 'Test chart.',
        heading: 'Apple price',
        body: 'Commentary.',
        chartImageUrl: IMAGE_URL,
        chartAlt: 'Apple price chart',
        chartExportUrl: INTERACTIVE_URL,
        chartSpec,
        chartProvenance: buildNewsletterChartProvenance({
          source: 'chart_editor',
          capturedAt: CAPTURED_AT,
          imageUrl: IMAGE_URL,
          interactiveUrl: INTERACTIVE_URL,
          scene: chartSpec,
        }),
        chartNeedsRegeneration: false,
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.captureChart.mockResolvedValue(undefined)
  mocks.getLibraryItem.mockResolvedValue(null)
})

describe('newsletter draft chart provenance boundary', () => {
  it('ignores client changes to provenance when the stored chart identity is unchanged', async () => {
    const existing = document()
    const forged = {
      ...existing,
      blocks: existing.blocks.map((block) => ({
        ...block,
        chartProvenance: {
          ...block.chartProvenance!,
          source: 'generated' as const,
          capturedAt: '2030-01-01T00:00:00.000Z',
        },
      })),
    }

    const reconciled = await reconcileNewsletterDraftClientCharts(
      { ownerId: 'user-1', sessionId: 'session-1' },
      existing,
      forged,
    )

    expect(reconciled.blocks[0]?.chartProvenance).toEqual(
      existing.blocks[0]?.chartProvenance,
    )
    expect(reconciled.blocks[0]?.chartNeedsRegeneration).toBe(false)
  })

  it('downgrades an internally consistent client-forged chart change', async () => {
    const existing = document()
    const changedScene = scene('A scene that was never captured')
    const forged = {
      ...existing,
      blocks: existing.blocks.map((block) => ({
        ...block,
        chartSpec: changedScene,
        chartProvenance: buildNewsletterChartProvenance({
          source: 'chart_editor',
          capturedAt: CAPTURED_AT,
          imageUrl: block.chartImageUrl,
          interactiveUrl: block.chartExportUrl,
          scene: changedScene,
        }),
      })),
    }

    const reconciled = await reconcileNewsletterDraftClientCharts(
      { ownerId: 'user-1', sessionId: 'session-1' },
      existing,
      forged,
    )
    const normalized = normalizeNewsletterDraftDocument(
      reconciled,
      PUBLIC_CHART_BASE_URL,
    )

    expect(normalized.blocks[0]?.chartProvenance).toMatchObject({
      source: 'legacy',
      rendererContract: 'legacy-reconstructed-v0',
    })
    expect(normalized.blocks[0]?.chartNeedsRegeneration).toBe(true)
  })

  it('rebuilds a library selection from the scoped server row', async () => {
    const existing = document()
    const libraryScene = scene('Trusted library scene')
    const libraryDigest = 'b'.repeat(64)
    const item: NewsletterChartLibraryItem = {
      id: 'library-1',
      ownerId: 'user-1',
      sessionId: 'session-1',
      title: 'Trusted library scene',
      symbol: 'AAPL',
      chartSpec: libraryScene,
      chartImageUrl: `https://cdn.example.com/immutable/bb/${libraryDigest}.png`,
      thumbnailUrl: `https://cdn.example.com/immutable/bb/${libraryDigest}.png`,
      chartExportUrl: `${PUBLIC_CHART_BASE_URL}/chart?symbol=AAPL&library=1`,
      capturedAt: CAPTURED_AT,
      rendererContract: 'the-intraday-newsletter-chart/v1',
      sceneHash: buildNewsletterChartProvenance({
        source: 'chart_library',
        capturedAt: CAPTURED_AT,
        imageUrl: `https://cdn.example.com/immutable/bb/${libraryDigest}.png`,
        interactiveUrl: `${PUBLIC_CHART_BASE_URL}/chart?symbol=AAPL&library=1`,
        scene: libraryScene,
      }).sceneSha256,
      imageSha256: libraryDigest,
      createdAt: CAPTURED_AT,
      updatedAt: CAPTURED_AT,
    }
    mocks.getLibraryItem.mockResolvedValue(item)
    const incoming = {
      ...existing,
      blocks: existing.blocks.map((block) => ({
        ...block,
        chartImageUrl: 'https://attacker.example/not-the-library-image.png',
        chartExportUrl: 'https://attacker.example/not-the-library-chart',
        chartSpec: scene('Client-supplied spoof'),
        chartProvenance: {
          ...block.chartProvenance!,
          source: 'chart_library' as const,
          libraryItemId: item.id,
        },
      })),
    }

    const reconciled = await reconcileNewsletterDraftClientCharts(
      { ownerId: 'user-1', sessionId: 'session-1' },
      existing,
      incoming,
    )
    const block = reconciled.blocks[0]!

    expect(mocks.getLibraryItem).toHaveBeenCalledWith(
      { ownerId: 'user-1', sessionId: 'session-1' },
      item.id,
      undefined,
    )
    expect(block).toMatchObject({
      chartImageUrl: item.chartImageUrl,
      chartExportUrl: item.chartExportUrl,
      chartSpec: item.chartSpec,
      chartNeedsRegeneration: false,
      chartProvenance: {
        source: 'chart_library',
        libraryItemId: item.id,
        imageUrl: item.chartImageUrl,
        interactiveUrl: item.chartExportUrl,
      },
    })
    expect(
      isNewsletterChartProvenanceCurrent(block.chartProvenance, {
        imageUrl: block.chartImageUrl,
        interactiveUrl: block.chartExportUrl,
        scene: block.chartSpec,
      }),
    ).toBe(true)
  })

  it('does not trust a library row whose stored scene hash no longer matches', async () => {
    const existing = document()
    const item = {
      id: 'library-1',
      ownerId: 'user-1',
      sessionId: 'session-1',
      title: 'Tampered library scene',
      symbol: 'AAPL',
      chartSpec: scene('Tampered library scene'),
      chartImageUrl: IMAGE_URL,
      thumbnailUrl: IMAGE_URL,
      chartExportUrl: INTERACTIVE_URL,
      capturedAt: CAPTURED_AT,
      rendererContract: 'the-intraday-newsletter-chart/v1',
      sceneHash: '0'.repeat(64),
      imageSha256: IMAGE_DIGEST,
      createdAt: CAPTURED_AT,
      updatedAt: CAPTURED_AT,
    } satisfies NewsletterChartLibraryItem
    mocks.getLibraryItem.mockResolvedValue(item)
    const incoming = {
      ...existing,
      blocks: existing.blocks.map((block) => ({
        ...block,
        chartSpec: item.chartSpec,
        chartProvenance: {
          ...block.chartProvenance!,
          source: 'chart_library' as const,
          libraryItemId: item.id,
        },
      })),
    }

    const reconciled = await reconcileNewsletterDraftClientCharts(
      { ownerId: 'user-1', sessionId: 'session-1' },
      existing,
      incoming,
    )
    const normalized = normalizeNewsletterDraftDocument(
      reconciled,
      PUBLIC_CHART_BASE_URL,
    )

    expect(normalized.blocks[0]?.chartProvenance?.source).toBe('legacy')
    expect(normalized.blocks[0]?.chartNeedsRegeneration).toBe(true)
  })

  it('marks a successfully recaptured chart ready for provenance checks', async () => {
    const scope = {
      ownerId: null,
      sessionId: `provenance-recapture-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)
    const source = {
      type: 'catalyst',
      catalyst: {
        reviewId: 'review-1',
        reviewKey: '2026-08-07:cash:gainer:AAPL',
        symbol: 'AAPL',
        marketDate: '2026-08-07',
        session: 'cash',
        direction: 'gainer',
        headline: 'Apple moved after earnings',
        summary: 'A server-owned catalyst summary.',
        bulletPoints: ['Revenue exceeded expectations.'],
        source: 'Company filing',
        sourceUrl: 'https://example.com/source',
        reviewNotes: 'Approved for publication.',
        reviewedAt: CAPTURED_AT,
      },
      attachedChartIds: ['library-1'],
      automatedAt: CAPTURED_AT,
      automationStatus: 'complete',
    } satisfies NonNullable<NewsletterDraftDocument['source']>
    const publication = {
      beehiivUrl: 'https://theintraday.example/p/apple',
      publishedAt: null,
    }

    try {
      const created = await createNewsletterDraftFromDocument(
        scope,
        { ...document(), source, publication },
        { publicChartBaseUrl: PUBLIC_CHART_BASE_URL },
      )
      const recaptured = await regenerateNewsletterDraftChart(
        scope,
        created.id,
        'block-1',
        {
          ...created.draft,
          source: undefined,
          publication: {
            beehiivUrl: 'https://attacker.example/forged',
            publishedAt: '2030-01-01T00:00:00.000Z',
          },
          blocks: created.draft.blocks.map((block) => ({
            ...block,
            chartSpec: scene('Recaptured on the server'),
          })),
        },
        {
          chartBaseUrl: 'http://localhost:3001',
          publicChartBaseUrl: PUBLIC_CHART_BASE_URL,
          expectedUpdatedAt: created.updatedAt,
        },
      )
      const block = recaptured.draft.blocks[0]!

      expect(block.chartNeedsRegeneration).toBe(false)
      expect(block.chartProvenance?.source).toBe('chart_editor')
      expect(recaptured.draft.source).toEqual(source)
      expect(recaptured.draft.publication).toEqual(publication)
      expect(
        isNewsletterChartProvenanceCurrent(block.chartProvenance, {
          imageUrl: block.chartImageUrl,
          interactiveUrl: block.chartExportUrl,
          scene: block.chartSpec,
        }),
      ).toBe(true)
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })

  it('rejects a traversal ticker before chart capture', async () => {
    const scope = {
      ownerId: null,
      sessionId: `provenance-traversal-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const created = await createNewsletterDraftFromDocument(
        scope,
        document(),
        { publicChartBaseUrl: PUBLIC_CHART_BASE_URL },
      )

      await expect(
        regenerateNewsletterDraftChart(
          scope,
          created.id,
          'block-1',
          {
            ...created.draft,
            ticker: '/private/tmp/newsletter-draft-chart-escape',
          },
          {
            chartBaseUrl: 'http://localhost:3001',
            publicChartBaseUrl: PUBLIC_CHART_BASE_URL,
            expectedUpdatedAt: created.updatedAt,
          },
        ),
      ).rejects.toBeInstanceOf(NewsletterCapturePathError)
      expect(mocks.captureChart).not.toHaveBeenCalled()
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })

  it('never uses a client template id as an output path component', async () => {
    const scope = {
      ownerId: null,
      sessionId: `provenance-template-path-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const created = await createNewsletterDraftFromDocument(
        scope,
        document(),
        { publicChartBaseUrl: PUBLIC_CHART_BASE_URL },
      )
      await regenerateNewsletterDraftChart(
        scope,
        created.id,
        'block-1',
        {
          ...created.draft,
          blocks: created.draft.blocks.map((block) => ({
            ...block,
            templateId: 'chart/../../../../private/tmp/escape',
          })),
        },
        {
          chartBaseUrl: 'http://localhost:3001',
          publicChartBaseUrl: PUBLIC_CHART_BASE_URL,
          expectedUpdatedAt: created.updatedAt,
        },
      )

      const captureOptions = mocks.captureChart.mock.calls[0]?.[1] as
        | { outputPath?: string }
        | undefined
      const outputPath = captureOptions?.outputPath ?? ''
      const outputDirectory = resolve('.newsletter-output')
      const relativePath = relative(outputDirectory, outputPath)
      expect(outputPath).not.toContain('template')
      expect(isAbsolute(relativePath)).toBe(false)
      expect(relativePath.startsWith('..')).toBe(false)
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })
})
