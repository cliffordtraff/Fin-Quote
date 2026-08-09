import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'
import type {
  WhyMovedCandidate,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'
import {
  __testOnly as catalystTestOnly,
  buildApprovedCatalystNewsletterDraft,
  ensureApprovedCatalystNewsletterDraft,
  type ApprovedCatalystNewsletterInput,
} from '@/lib/newsletter/catalyst-workflow'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import { saveNewsletterDraft } from '@/lib/newsletter/drafts'
import { recordNewsletterPublication } from '@/lib/newsletter/publication'
import { NEWSLETTER_SUBJECT_MAX_LENGTH } from '@/lib/newsletter/delivery-quality'
import { hashNewsletterChartScene } from '@/lib/newsletter/chart-provenance'
import { resolveChartingPlatformNewsletterChart } from '@/lib/newsletter/charting-platform-export'

const getNewsletterChartLibraryItemMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/newsletter/chart-library', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/chart-library')>()
  return {
    ...actual,
    getNewsletterChartLibraryItem: getNewsletterChartLibraryItemMock,
  }
})

const testSessionIds: string[] = []

function createScope() {
  const sessionId = `catalyst-workflow-${randomUUID()}`
  testSessionIds.push(sessionId)
  return { ownerId: null, sessionId }
}

function createInput(): ApprovedCatalystNewsletterInput {
  const candidate: WhyMovedCandidate = {
    reviewKey: '2026-07-29:cash:gainer:GRMN',
    symbol: 'GRMN',
    name: 'Garmin',
    price: 228.15,
    change: 31.4,
    changesPercentage: 15.96,
    direction: 'gainer',
    session: 'cash',
    marketDate: '2026-07-29',
  }
  const review: WhyMovedReviewRecord = {
    id: 'review-1',
    reviewKey: candidate.reviewKey,
    symbol: candidate.symbol,
    marketDate: candidate.marketDate,
    session: candidate.session,
    direction: candidate.direction,
    status: 'approved',
    notes: 'Lead with the guidance raise.',
    reviewerId: 'editor-1',
    reviewedAt: '2026-07-29T14:20:00.000Z',
    createdAt: '2026-07-29T14:00:00.000Z',
    updatedAt: '2026-07-29T14:20:00.000Z',
  }
  const whyMoving: StockWhyMovingResult = {
    symbol: 'GRMN',
    status: 'found',
    displayText: 'Garmin beat estimates and raised guidance.',
    headline: 'Garmin beats Q2 estimates and raises full-year guidance',
    summary:
      'Record second-quarter results and stronger demand supported a higher outlook.',
    bulletPoints: [
      'Q2 EPS exceeded expectations.',
      'Management raised full-year guidance.',
    ],
    sentiment: 'positive',
    source: 'Finviz',
    sourceTimestamp: '2026-07-29T13:59:00.000Z',
    isCatalyst: true,
    sourceUrl: 'https://finviz.com/quote.ashx?t=GRMN&p=d',
    fetchedAt: '2026-07-29T14:00:00.000Z',
    errorMessage: null,
  }
  return { candidate, review, whyMoving }
}

function createChart(
  id = 'chart-1',
  title = 'GRMN Catalyst Reaction',
): NewsletterChartLibraryItem {
  const chartSpec: NewsletterChartLibraryItem['chartSpec'] = {
    mode: 'price',
    symbol: 'GRMN',
    range: '1m',
    interval: 'D',
    chartType: 'candles',
    title,
    chartExportSpec: {
      symbol: 'GRMN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      viewportTimeRange: { startTime: 1, endTime: 2 },
      dataTimeRange: { startTime: 1, endTime: 2 },
    },
  }
  const chartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
    chartBaseUrl: 'https://charts.theintraday.com',
    theme: 'light',
  }).interactiveUrl
  return {
    id,
    ownerId: null,
    sessionId: 'chart-session',
    title,
    symbol: 'GRMN',
    chartSpec,
    chartImageUrl: `https://cdn.example.com/${id}.png`,
    thumbnailUrl: `https://cdn.example.com/${id}.png`,
    chartExportUrl,
    capturedAt: '2026-07-29T14:00:00.000Z',
    rendererContract: 'the-intraday-newsletter-chart/v1',
    sceneHash: hashNewsletterChartScene(chartSpec),
    imageSha256: 'b'.repeat(64),
    createdAt: '2026-07-29T14:00:00.000Z',
    updatedAt: '2026-07-29T14:00:00.000Z',
  }
}

afterEach(() => {
  getNewsletterChartLibraryItemMock.mockReset()
  for (const sessionId of testSessionIds.splice(0)) {
    rmSync(resolve('.newsletter-drafts', sessionId), {
      recursive: true,
      force: true,
    })
  }
})

describe('catalyst-to-newsletter workflow', () => {
  it('builds a sourced newsletter document and attaches matching saved charts', () => {
    const draft = buildApprovedCatalystNewsletterDraft(
      createInput(),
      [createChart('chart-1'), createChart('chart-2', 'GRMN Trend')],
      { now: new Date('2026-07-29T14:30:00.000Z') },
    )

    expect(draft.source).toMatchObject({
      type: 'catalyst',
      attachedChartIds: ['chart-1', 'chart-2'],
      automationStatus: 'complete',
      catalyst: {
        reviewKey: '2026-07-29:cash:gainer:GRMN',
        symbol: 'GRMN',
      },
    })
    expect(draft.subjectLine).toContain('Garmin beats Q2 estimates')
    expect(draft.blocks).toHaveLength(2)
    expect(draft.blocks[0]).toMatchObject({
      chartImageUrl: 'https://cdn.example.com/chart-1.png',
      chartNeedsRegeneration: false,
      ctaText: 'Read catalyst source',
    })
    expect(draft.blocks[0]?.body).toContain('Management raised full-year guidance')
  })

  it('normalizes catalyst subjects before creating the draft', () => {
    const input = createInput()
    input.whyMoving.headline =
      'Garmin rallies...\r\nafter record demand and a materially higher full-year outlook… with more catalysts ahead'

    const draft = buildApprovedCatalystNewsletterDraft(input, [createChart()])

    expect(draft.subjectLine.length).toBeLessThanOrEqual(
      NEWSLETTER_SUBJECT_MAX_LENGTH,
    )
    expect(draft.subjectLine).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    expect(draft.subjectLine).not.toMatch(/\.{3}|…/)
  })

  it('creates exactly one draft for repeated approvals and records automation history', async () => {
    const scope = createScope()
    const input = createInput()
    const listCharts = vi.fn().mockResolvedValue([createChart()])

    const first = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts,
      now: () => new Date('2026-07-29T14:30:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })
    const second = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts,
      now: () => new Date('2026-07-29T14:31:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.draft.id).toBe(first.draft.id)
    expect(listCharts).toHaveBeenCalledTimes(1)
    expect(first.draft.history.map((event) => event.type)).toEqual([
      'created',
      'chart_attached',
    ])
  })

  it('creates and saves a default chart when no matching chart exists', async () => {
    const scope = createScope()
    const generatedChart = createChart('generated-chart')
    const createChartMock = vi.fn().mockResolvedValue(generatedChart)

    const result = await ensureApprovedCatalystNewsletterDraft(
      scope,
      createInput(),
      {
        listCharts: vi.fn().mockResolvedValue([]),
        createChart: createChartMock,
        now: () => new Date('2026-07-29T14:30:00.000Z'),
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    expect(createChartMock).toHaveBeenCalledOnce()
    expect(result.generatedChart).toBe(true)
    expect(result.chartsAttached).toBe(1)
    expect(result.draft.draft.source?.automationStatus).toBe('complete')
    expect(result.draft.draft.source?.attachedChartIds).toEqual([
      'generated-chart',
    ])
  })

  it('recaptures instead of attaching stale or legacy same-symbol charts', async () => {
    const scope = createScope()
    const oldChart = {
      ...createChart('old-current-chart'),
      capturedAt: '2026-06-29T14:00:00.000Z',
      createdAt: '2026-06-29T14:00:00.000Z',
      updatedAt: '2026-06-29T14:00:00.000Z',
    }
    const legacyChart = {
      ...createChart('legacy-chart'),
      rendererContract: 'legacy-reconstructed-v0',
    }
    const generatedChart = createChart('verified-recapture')
    const createChartMock = vi.fn().mockResolvedValue(generatedChart)

    const result = await ensureApprovedCatalystNewsletterDraft(
      scope,
      createInput(),
      {
        listCharts: vi.fn().mockResolvedValue([oldChart, legacyChart]),
        createChart: createChartMock,
        now: () => new Date('2026-07-29T14:30:00.000Z'),
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    expect(createChartMock).toHaveBeenCalledOnce()
    expect(result.generatedChart).toBe(true)
    expect(result.draft.draft.source).toMatchObject({
      automationStatus: 'complete',
      attachedChartIds: ['verified-recapture'],
    })
    expect(result.draft.draft.blocks[0]).toMatchObject({
      chartNeedsRegeneration: false,
      chartProvenance: {
        rendererContract: 'the-intraday-newsletter-chart/v1',
      },
    })
  })

  it('does not reuse a complete catalyst draft whose exact chart is from an older market date', () => {
    const draft = buildApprovedCatalystNewsletterDraft(
      createInput(),
      [createChart('dated-chart')],
      { now: new Date('2026-07-29T14:30:00.000Z') },
    )
    const provenance = draft.blocks[0]?.chartProvenance
    expect(provenance).toBeDefined()
    if (provenance) {
      provenance.capturedAt = '2026-06-29T14:00:00.000Z'
    }

    expect(catalystTestOnly.isCompletedCatalystDraftReusable(draft)).toBe(
      false,
    )
  })

  it('repairs a source marked complete when its saved chart is quarantined', async () => {
    const scope = createScope()
    const input = createInput()
    const first = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([createChart('initial-chart')]),
      now: () => new Date('2026-07-29T14:30:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })
    const quarantined = await saveNewsletterDraft(
      scope,
      first.draft.id,
      {
        ...first.draft.draft,
        blocks: first.draft.draft.blocks.map((block) => ({
          ...block,
          chartNeedsRegeneration: true,
        })),
      },
      'ready',
      {
        expectedUpdatedAt: first.draft.updatedAt,
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )
    expect(quarantined.draft.source?.automationStatus).toBe('complete')
    expect(quarantined.draft.blocks[0]?.chartNeedsRegeneration).toBe(true)
    expect(quarantined.status).toBe('ready')

    const repairChart = createChart('repair-after-false-complete')
    getNewsletterChartLibraryItemMock.mockImplementation(
      async (requestedScope, requestedId) =>
        requestedScope.sessionId === scope.sessionId &&
        requestedId === repairChart.id
          ? repairChart
          : null,
    )
    const listCharts = vi.fn().mockResolvedValue([repairChart])
    const repaired = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts,
      now: () => new Date('2026-07-29T14:40:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })

    expect(listCharts).toHaveBeenCalledOnce()
    expect(repaired.created).toBe(false)
    expect(repaired.draft.status).toBe('review')
    expect(repaired.draft.draft.source).toMatchObject({
      automationStatus: 'complete',
      attachedChartIds: ['repair-after-false-complete'],
    })
    expect(repaired.draft.draft.blocks[0]).toMatchObject({
      chartNeedsRegeneration: false,
      chartProvenance: {
        libraryItemId: 'repair-after-false-complete',
      },
    })
  })

  it('repairs reordered charts by library identity without dropping unmatched edited blocks', async () => {
    const scope = createScope()
    const input = createInput()
    const chartOne = createChart('chart-one', 'First saved chart')
    const chartTwo = createChart('chart-two', 'Second saved chart')
    const first = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([chartOne, chartTwo]),
      now: () => new Date('2026-07-29T14:30:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })
    const [firstBlock, secondBlock] = first.draft.draft.blocks
    const reordered = await saveNewsletterDraft(
      scope,
      first.draft.id,
      {
        ...first.draft.draft,
        blocks: [
          {
            ...secondBlock,
            heading: 'Editor copy for chart two',
            body: '<p>Keep the second chart analysis.</p>',
            chartNeedsRegeneration: true,
          },
          {
            ...firstBlock,
            heading: 'Editor copy for chart one',
            body: '<p>Keep the first chart analysis.</p>',
            chartNeedsRegeneration: true,
          },
        ],
      },
      first.draft.status,
      {
        expectedUpdatedAt: first.draft.updatedAt,
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )
    expect(reordered.draft.blocks).toHaveLength(2)

    const repairedChartOne = {
      ...createChart('new-primary-recapture', 'Recaptured primary chart'),
      chartImageUrl: 'https://cdn.example.com/new-primary-recapture.png',
      thumbnailUrl: 'https://cdn.example.com/new-primary-recapture.png',
      capturedAt: '2026-07-29T14:45:00.000Z',
      updatedAt: '2026-07-29T14:45:00.000Z',
    }
    getNewsletterChartLibraryItemMock.mockImplementation(
      async (requestedScope, requestedId) =>
        requestedScope.sessionId === scope.sessionId &&
        requestedId === repairedChartOne.id
          ? repairedChartOne
          : null,
    )
    const repaired = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([repairedChartOne]),
      now: () => new Date('2026-07-29T14:46:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })

    expect(repaired.draft.draft.blocks).toHaveLength(2)
    expect(repaired.draft.draft.blocks.map((block) => block.id)).toEqual([
      secondBlock.id,
      firstBlock.id,
    ])
    expect(repaired.draft.draft.blocks[0]).toMatchObject({
      heading: 'Editor copy for chart two',
      body: '<p>Keep the second chart analysis.</p>',
      chartNeedsRegeneration: true,
      chartProvenance: { libraryItemId: 'chart-two' },
    })
    expect(repaired.draft.draft.blocks[1]).toMatchObject({
      heading: 'Editor copy for chart one',
      body: '<p>Keep the first chart analysis.</p>',
      chartImageUrl: 'https://cdn.example.com/new-primary-recapture.png',
      chartNeedsRegeneration: false,
      chartProvenance: { libraryItemId: 'new-primary-recapture' },
    })
    expect(repaired.draft.draft.blocks[1]?.caption).toContain(
      'Recaptured primary chart',
    )
    expect(repaired.draft.draft.blocks[1]?.caption).not.toContain(
      'First saved chart',
    )
    expect(repaired.draft.draft.source).toMatchObject({
      automationStatus: 'needs_chart',
      attachedChartIds: ['new-primary-recapture'],
    })
  })

  it('refreshes secondary chart labels when reordered blocks receive new identities', async () => {
    const scope = createScope()
    const input = createInput()
    const oldPrimary = createChart('old-primary', 'Old primary chart')
    const oldSecondary = createChart('old-secondary', 'Old secondary chart')
    const first = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([oldPrimary, oldSecondary]),
      now: () => new Date('2026-07-29T14:30:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })
    const [primaryBlock, secondaryBlock] = first.draft.draft.blocks
    await saveNewsletterDraft(
      scope,
      first.draft.id,
      {
        ...first.draft.draft,
        blocks: [
          { ...secondaryBlock, chartNeedsRegeneration: true },
          {
            ...primaryBlock,
            heading: 'Editor catalyst headline',
            body: '<p>Editor catalyst analysis.</p>',
            chartNeedsRegeneration: true,
          },
        ],
      },
      first.draft.status,
      {
        expectedUpdatedAt: first.draft.updatedAt,
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    const newPrimary = createChart('new-primary', 'New primary chart')
    const newSecondary = createChart('new-secondary', 'New secondary chart')
    getNewsletterChartLibraryItemMock.mockImplementation(
      async (requestedScope, requestedId) =>
        requestedScope.sessionId === scope.sessionId
          ? ([newPrimary, newSecondary].find(
              (chart) => chart.id === requestedId,
            ) ?? null)
          : null,
    )
    const repaired = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([newPrimary, newSecondary]),
      now: () => new Date('2026-07-29T14:45:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })

    expect(repaired.draft.draft.blocks.map((block) => block.id)).toEqual([
      secondaryBlock.id,
      primaryBlock.id,
    ])
    expect(repaired.draft.draft.blocks[0]).toMatchObject({
      heading: 'New secondary chart',
      chartProvenance: { libraryItemId: 'new-secondary' },
    })
    expect(repaired.draft.draft.blocks[0]?.caption).toContain(
      'New secondary chart',
    )
    expect(repaired.draft.draft.blocks[0]?.caption).not.toContain(
      'Old secondary chart',
    )
    expect(repaired.draft.draft.blocks[1]).toMatchObject({
      heading: 'Editor catalyst headline',
      body: '<p>Editor catalyst analysis.</p>',
      chartProvenance: { libraryItemId: 'new-primary' },
    })
    expect(repaired.draft.draft.source?.automationStatus).toBe('complete')
  })

  it('preserves a custom secondary heading while refreshing new chart identity labels', () => {
    const oldDraft = buildApprovedCatalystNewsletterDraft(
      createInput(),
      [
        createChart('old-primary', 'Old primary chart'),
        createChart('old-secondary', 'Old secondary chart'),
      ],
    )
    const newDraft = buildApprovedCatalystNewsletterDraft(
      createInput(),
      [
        createChart('new-primary', 'New primary chart'),
        createChart('new-secondary', 'New secondary chart'),
      ],
    )
    const editedSecondary = {
      ...oldDraft.blocks[1],
      heading: 'Editor comparison: margins versus valuation',
      chartNeedsRegeneration: true,
    }

    const repaired = catalystTestOnly.mergeCatalystChartRepair(
      editedSecondary,
      newDraft.blocks[1],
    )

    expect(repaired.heading).toBe(
      'Editor comparison: margins versus valuation',
    )
    expect(repaired.chartAlt).toBe('New secondary chart')
    expect(repaired.caption).toContain('New secondary chart')
    expect(repaired.caption).not.toContain('Old secondary chart')
  })

  it('preserves edited copy when a failed chart attachment is retried', async () => {
    const scope = createScope()
    const input = createInput()
    const first = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([]),
      createChart: vi.fn().mockRejectedValue(new Error('Charting offline')),
      now: () => new Date('2026-07-29T14:30:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })
    const editedBody = '<p>Editor revised this paragraph before retrying.</p>'
    await saveNewsletterDraft(
      scope,
      first.draft.id,
      {
        ...first.draft.draft,
        subjectLine: 'Editor revised subject',
        blocks: first.draft.draft.blocks.map((block, index) =>
          index === 0 ? { ...block, body: editedBody } : block,
        ),
      },
      first.draft.status,
    )

    const repairChart = createChart('repair-chart')
    getNewsletterChartLibraryItemMock.mockImplementation(
      async (requestedScope, requestedId) =>
        requestedScope.sessionId === scope.sessionId && requestedId === repairChart.id
          ? repairChart
          : null,
    )
    const repaired = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([repairChart]),
      now: () => new Date('2026-07-29T14:40:00.000Z'),
      publicChartBaseUrl: 'https://charts.theintraday.com',
    })

    expect(repaired.created).toBe(false)
    expect(repaired.draft.subjectLine).toBe('Editor revised subject')
    expect(repaired.draft.draft.blocks[0]?.body).toBe(editedBody)
    expect(repaired.draft.draft.blocks[0]).toMatchObject({
      chartImageUrl: 'https://cdn.example.com/repair-chart.png',
      chartNeedsRegeneration: false,
    })
    expect(repaired.draft.draft.source).toMatchObject({
      automationStatus: 'complete',
      attachedChartIds: ['repair-chart'],
    })
  })

  it('records Beehiiv publication metadata, status, and history', async () => {
    const scope = createScope()
    const automated = await ensureApprovedCatalystNewsletterDraft(
      scope,
      createInput(),
      {
        listCharts: vi.fn().mockResolvedValue([createChart()]),
        now: () => new Date('2026-07-29T14:30:00.000Z'),
        publicChartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    const published = await recordNewsletterPublication(
      scope,
      automated.draft.id,
      'https://theintraday.beehiiv.com/p/garmin-guidance',
      new Date('2026-07-29T20:15:00.000Z'),
      automated.draft.updatedAt,
    )

    expect(published.status).toBe('published')
    expect(published.beehiivUrl).toBe(
      'https://theintraday.beehiiv.com/p/garmin-guidance',
    )
    expect(published.publishedAt).toBe('2026-07-29T20:15:00.000Z')
    expect(published.history.map((event) => event.type)).toEqual([
      'created',
      'chart_attached',
      'status_changed',
      'publication_recorded',
    ])
  })
})
