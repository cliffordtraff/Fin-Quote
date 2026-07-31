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
  buildApprovedCatalystNewsletterDraft,
  ensureApprovedCatalystNewsletterDraft,
  type ApprovedCatalystNewsletterInput,
} from '@/lib/newsletter/catalyst-workflow'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import { saveNewsletterDraft } from '@/lib/newsletter/drafts'
import { recordNewsletterPublication } from '@/lib/newsletter/publication'

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
  return {
    id,
    ownerId: null,
    sessionId: 'chart-session',
    title,
    symbol: 'GRMN',
    chartSpec: {
      mode: 'price',
      symbol: 'GRMN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      title,
    },
    chartImageUrl: `https://cdn.example.com/${id}.png`,
    thumbnailUrl: `https://cdn.example.com/${id}.png`,
    chartExportUrl: `https://charts.theintraday.com/tos/GRMN?chart=${id}`,
    createdAt: '2026-07-29T14:00:00.000Z',
    updatedAt: '2026-07-29T14:00:00.000Z',
  }
}

afterEach(() => {
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

    const repaired = await ensureApprovedCatalystNewsletterDraft(scope, input, {
      listCharts: vi.fn().mockResolvedValue([createChart('repair-chart')]),
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
