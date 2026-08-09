import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import { describe, expect, it } from 'vitest'

import type { NewsletterResult } from '@/lib/newsletter/types'
import { NewsletterDraftInputValidationError } from '@/lib/newsletter/draft-request'
import {
  buildNewsletterDraftFromResult,
  createBlankNewsletterDraft,
  createNewsletterDraftFromDocument,
  deleteNewsletterDraft,
  forkNewsletterDraft,
  getNewsletterDraft,
  listNewsletterDrafts,
  NewsletterDraftConflictError,
  NewsletterDraftIdempotencyConflictError,
  NewsletterPublishedDraftImmutableError,
  normalizeNewsletterDraftDocument,
  preserveNewsletterDraftServerMetadata,
  renderNewsletterDraftPreviewHtml,
  saveNewsletterDraft,
} from '@/lib/newsletter/drafts'

const sampleResult: NewsletterResult = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generationPrompt: 'Focus on Apple services growth and margin durability.',
  generatedAt: '2026-03-26T12:00:00.000Z',
  subjectLine: 'Apple snapshot',
  selections: [
    {
      templateId: 'revenue_vs_net_income',
      reason: 'Revenue and profit both moved materially.',
    },
  ],
  blocks: [
    {
      layoutId: 'chart_plus_commentary',
      data: {
        heading: 'Revenue still outruns earnings',
        body: 'Net income improved, but revenue remains the main driver.',
        chartImageUrl: 'AAPL_revenue_vs_net_income.png',
        chartAlt: 'Revenue versus net income chart',
      },
      html: '<table><tr><td>unused</td></tr></table>',
    },
  ],
  chartSpecs: [
    {
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'],
      title: 'AAPL Revenue vs Net Income',
      chartType: 'bar',
      periodType: 'annual',
      showLabels: true,
    },
  ],
  fullHtml: '<html />',
  beehiivHtml: '<table />',
  chartPaths: ['/tmp/AAPL_revenue_vs_net_income.png'],
  htmlPath: '/tmp/AAPL_newsletter.html',
  beehiivHtmlPath: '/tmp/AAPL_newsletter_beehiiv.html',
  previewPath: '/tmp/AAPL_newsletter_preview.png',
  timings: {},
  autoPickedStock: false,
  todayQuote: {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    change: 1.5,
    changesPercentage: 0.75,
    marketCap: 3_000_000_000_000,
    pe: 30.2,
    ytdReturn: 8.1,
  },
  editorialHook: 'Apple extends its manufacturing push.',
}

describe('newsletter drafts', () => {
  it('rejects a missing runtime fork idempotency key before reading storage', async () => {
    const draft = buildNewsletterDraftFromResult(
      sampleResult,
      'https://charts.theintraday.com',
    )

    await expect(
      forkNewsletterDraft(
        { ownerId: null, sessionId: `test-session-${randomUUID()}` },
        randomUUID(),
        draft,
        { idempotencyKey: undefined as unknown as string },
      ),
    ).rejects.toBeInstanceOf(NewsletterDraftInputValidationError)
  })

  it('keeps catalyst provenance and publication metadata server-owned', () => {
    const existing = {
      ...buildNewsletterDraftFromResult(sampleResult),
      source: {
        type: 'catalyst' as const,
        catalyst: {
          reviewId: 'review-1',
          reviewKey: '2026-07-29:cash:gainer:AAPL',
          symbol: 'AAPL',
          marketDate: '2026-07-29',
          session: 'cash',
          direction: 'gainer' as const,
          headline: 'Approved catalyst',
          summary: 'Approved summary',
          bulletPoints: [],
          source: 'Finviz',
          sourceUrl: 'https://finviz.com/quote.ashx?t=AAPL&p=d',
          reviewNotes: '',
          reviewedAt: '2026-07-29T14:00:00.000Z',
        },
        attachedChartIds: ['chart-1'],
        automatedAt: '2026-07-29T14:01:00.000Z',
        automationStatus: 'complete' as const,
      },
      publication: {
        beehiivUrl: 'https://theintraday.beehiiv.com/p/apple',
        publishedAt: '2026-07-29T20:00:00.000Z',
      },
    }
    const incoming = {
      ...existing,
      source: undefined,
      publication: {
        beehiivUrl: 'https://attacker.example/fake',
        publishedAt: '2000-01-01T00:00:00.000Z',
      },
      subjectLine: 'Legitimate copy edit',
    }

    expect(
      preserveNewsletterDraftServerMetadata(existing, incoming),
    ).toMatchObject({
      subjectLine: 'Legitimate copy edit',
      source: existing.source,
      publication: existing.publication,
    })
  })

  it('seeds a structured draft from a generated newsletter result', () => {
    const draft = buildNewsletterDraftFromResult(
      sampleResult,
      'https://charts.theintraday.com',
    )

    expect(draft.ticker).toBe('AAPL')
    expect(draft.generationPrompt).toBe('Focus on Apple services growth and margin durability.')
    expect(draft.introText).toContain('Apple Inc. (AAPL) is +0.75% (+$1.50) today.')
    expect(draft.header).toEqual({
      title: 'Apple snapshot',
      dateText: 'March 26, 2026',
      badgeText: 'AAPL Snapshot',
      logoUrl: 'https://financialmodelingprep.com/image-stock/AAPL.png',
    })
    expect(draft.blocks).toHaveLength(1)
    expect(draft.statsCard?.items).toEqual([
      { label: 'Market Cap', value: '$3.0T' },
      { label: 'P/E Ratio', value: '30.2x' },
      { label: 'YTD Performance', value: '+8.1%' },
    ])
    expect(draft.blocks[0]?.chartImageUrl).toBe('/newsletter-charts/AAPL_revenue_vs_net_income.png')
    expect(draft.blocks[0]?.chartExportUrl).toContain('/tos/AAPL')
    expect(draft.blocks[0]?.chartNeedsRegeneration).toBe(false)
  })

  it('never re-hashes mismatched chart provenance into a trusted source', () => {
    const original = buildNewsletterDraftFromResult(
      sampleResult,
      'https://charts.theintraday.com',
    )
    const originalBlock = original.blocks[0]!
    const tampered = normalizeNewsletterDraftDocument(
      {
        ...original,
        blocks: [
          {
            ...originalBlock,
            chartSpec: {
              ...originalBlock.chartSpec,
              title: 'A different scene that was never captured',
            },
          },
        ],
      },
      'https://charts.theintraday.com',
    )

    expect(tampered.blocks[0]?.chartProvenance).toMatchObject({
      source: 'legacy',
      rendererContract: 'legacy-reconstructed-v0',
    })
    expect(tampered.blocks[0]?.chartNeedsRegeneration).toBe(true)
  })

  it('normalizes generated subjects at the draft boundary', () => {
    const draft = buildNewsletterDraftFromResult({
      ...sampleResult,
      subjectLine:
        'Apple advances...\r\non durable services growth and stronger margins into the next fiscal year… and beyond',
    })

    expect(draft.subjectLine.length).toBeLessThanOrEqual(60)
    expect(draft.subjectLine).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    expect(draft.subjectLine).not.toMatch(/\.{3}|…/)
    expect(draft.header?.title).toBe(draft.subjectLine)
  })

  it('persists the durable published chart URL instead of a serverless file path', () => {
    const publicUrl =
      'https://example.supabase.co/storage/v1/object/public/newsletter-charts/2026-08-05/AAPL_revenue_vs_net_income.png'
    const draft = buildNewsletterDraftFromResult({
      ...sampleResult,
      publishedUrls: {
        'AAPL_revenue_vs_net_income.png': publicUrl,
      },
    })

    expect(draft.blocks[0]?.chartImageUrl).toBe(publicUrl)
  })

  it('normalizes draft preview data and renders preview HTML with root-relative assets', () => {
    const seeded = buildNewsletterDraftFromResult(
      sampleResult,
      'https://charts.theintraday.com',
    )
    const draft = normalizeNewsletterDraftDocument(
      {
        ...seeded,
        subjectLine: 'Edited Apple snapshot',
        introText: 'Manual intro text from the browser editor.',
        header: {
          title: 'The Intraday Plus',
          dateText: 'April 1, 2026',
          badgeText: 'Apple Deep Dive',
        },
        statsCard: {
          items: [
            { label: 'Market Cap', value: '$3.2T' },
            { label: 'P/E Ratio', value: '31.0x' },
            { label: 'YTD Performance', value: '-2.5%' },
          ],
        },
      },
      'https://charts.theintraday.com',
    )

    const html = renderNewsletterDraftPreviewHtml(
      draft,
      'https://charts.theintraday.com',
    )

    expect(html).toContain('Edited Apple snapshot')
    expect(html).toContain('Manual intro text from the browser editor.')
    expect(html).toContain('The Intraday Plus')
    expect(html).toContain('April 1, 2026')
    expect(html).toContain('Apple Deep Dive')
    expect(html).toContain('$3.2T')
    expect(html).toContain('31.0x')
    expect(html).toContain('-2.5%')
    expect(html).toContain('src="/newsletter-charts/AAPL_revenue_vs_net_income.png"')
    expect(html).toContain('href="https://charts.theintraday.com/tos/AAPL')
    expect(html).toContain('Read online')
    expect(html).toContain('Powered by beehiiv')
    expect(html).toContain('background: #ffffff;')
    expect(html).toContain('Data sourced from SEC filings and Financial Modeling Prep.')
    expect(html).toContain('border-top:1px solid #e5e7eb;padding-top:24px;margin-top:24px;')
    expect(html).not.toContain('border-top:1px solid #e5e7eb;padding-top:24px;">')
  })

  it('strips trailing year-range suffixes from stored chart titles so the editor matches the rendered chart', () => {
    const seeded = buildNewsletterDraftFromResult(
      {
        ...sampleResult,
        chartSpecs: [
          {
            ...sampleResult.chartSpecs[0],
            title: 'AAPL Net Income vs Free Cash Flow (2020–2026)',
            subtitle: 'Annual values (2020-2026)',
          },
        ],
      },
      'https://charts.theintraday.com',
    )

    const draft = normalizeNewsletterDraftDocument(
      seeded,
      'https://charts.theintraday.com',
    )

    expect(draft.blocks[0]?.chartSpec.title).toBe('AAPL Net Income vs Free Cash Flow')
    expect(draft.blocks[0]?.chartSpec.subtitle).toBe('Annual values')
  })

  it('preserves price-chart draft specs and links them back to the price workspace', () => {
    const draft = buildNewsletterDraftFromResult(
      {
        ...sampleResult,
        selections: [
          {
            templateId: 'price_trend_6m',
            reason: 'Momentum is the clearest part of the story.',
          },
        ],
        chartSpecs: [
          {
            mode: 'price',
            symbol: 'AAPL',
            range: '6m',
            interval: 'D',
            chartType: 'candles',
            priceState: {
              indicators: [{ kind: 'macd', panel: 'lower-1' }],
              volumeVisible: false,
              viewport: { startIndex: 52, visibleBars: 40 },
            },
            title: 'AAPL Price Trend (6M)',
          },
        ],
      },
      'https://charts.theintraday.com',
    )

    expect(draft.blocks[0]?.chartSpec).toMatchObject({
      mode: 'price',
      symbol: 'AAPL',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
      priceState: {
        symbol: 'AAPL',
        ticker: 'AAPL',
        range: '6m',
        interval: 'D',
        chartType: 'candles',
        volumeVisible: false,
        viewport: { startIndex: 52, visibleBars: 40 },
        indicators: [{ kind: 'macd', panel: 'lower-1' }],
      },
    })
    expect(draft.blocks[0]?.chartExportUrl).toContain('view=price')
    expect(draft.blocks[0]?.chartExportUrl).toContain('chartType=candles')
  })

  it('preserves supported price-chart draft types', () => {
    const draft = normalizeNewsletterDraftDocument(
      {
        ticker: 'TSLA',
        format: 'single_stock',
        featuredTickers: ['TSLA'],
        generatedAt: '2026-03-26T12:00:00.000Z',
        subjectLine: 'Tesla snapshot',
        introText: 'Tesla draft intro.',
        autoPickedStock: true,
        blocks: [
          {
            id: 'block-1',
            layoutId: 'chart_plus_commentary',
            templateId: 'price_trend_1y',
            selectionReason: 'Longer rerating story.',
            heading: 'Tesla heading',
            body: 'Tesla body',
            chartImageUrl: '/newsletter-charts/tsla.png',
            chartAlt: '',
            chartExportUrl: '',
            chartNeedsRegeneration: false,
            chartSpec: {
              mode: 'price',
              symbol: 'TSLA',
              range: '1y',
              interval: 'D',
              chartType: 'line',
              priceState: {
                indicators: [{ kind: 'macd', panel: 'lower-1' }],
                volumeVisible: false,
                viewport: { startIndex: 180, visibleBars: 66 },
              },
            },
          },
        ],
      },
      'https://charts.theintraday.com',
    )

    expect('chartType' in draft.blocks[0]!.chartSpec && draft.blocks[0]!.chartSpec.chartType).toBe('line')
    expect('priceState' in draft.blocks[0]!.chartSpec && draft.blocks[0]!.chartSpec.priceState).toMatchObject({
      symbol: 'TSLA',
      ticker: 'TSLA',
      range: '1y',
      interval: 'D',
      chartType: 'line',
      volumeVisible: false,
      viewport: { startIndex: 180, visibleBars: 66 },
      indicators: [{ kind: 'macd', panel: 'lower-1' }],
    })
    expect(draft.blocks[0]?.chartExportUrl).toContain('chartType=line')
  })

  it('preserves per-block primary tickers in market roundup drafts', () => {
    const draft = normalizeNewsletterDraftDocument(
      {
        ticker: 'MARKET',
        format: 'market_roundup',
        featuredTickers: ['AAPL', 'MSFT', 'NVDA'],
        generatedAt: '2026-03-26T12:00:00.000Z',
        subjectLine: 'Market Roundup',
        introText: 'Three names driving the tape today.',
        autoPickedStock: true,
        blocks: [
          {
            id: 'block-1',
            layoutId: 'chart_plus_commentary',
            templateId: 'revenue_vs_net_income',
            selectionReason: 'Apple still has the cleanest recent fundamentals setup.',
            heading: 'Apple heading',
            body: 'Apple body',
            chartImageUrl: '/newsletter-charts/aapl.png',
            chartAlt: '',
            chartExportUrl: '',
            chartNeedsRegeneration: false,
            chartSpec: {
              stocks: ['AAPL'],
              metrics: ['revenue', 'net_income'],
              periodType: 'quarterly',
            },
          },
          {
            id: 'block-2',
            layoutId: 'chart_plus_commentary',
            templateId: 'price_reaction_1m',
            selectionReason: 'Microsoft tape action is leading the price move.',
            heading: 'Microsoft heading',
            body: 'Microsoft body',
            chartImageUrl: '/newsletter-charts/msft.png',
            chartAlt: '',
            chartExportUrl: '',
            chartNeedsRegeneration: false,
            chartSpec: {
              mode: 'price',
              symbol: 'MSFT',
              range: '1m',
              interval: 'D',
              chartType: 'candles',
            },
          },
        ],
      },
      'https://charts.theintraday.com',
    )

    expect('stocks' in draft.blocks[0]!.chartSpec && draft.blocks[0]!.chartSpec.stocks[0]).toBe('AAPL')
    expect('symbol' in draft.blocks[1]!.chartSpec && draft.blocks[1]!.chartSpec.symbol).toBe('MSFT')
  })

  it('creates blank manual drafts with starter sections and no forced roundup tickers', async () => {
    const scope = {
      ownerId: null,
      sessionId: `test-session-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const singleStockDraft = await createBlankNewsletterDraft(scope, undefined, {
        format: 'single_stock',
        publicChartBaseUrl: 'https://charts.theintraday.com',
      })
      const marketRoundupDraft = await createBlankNewsletterDraft(scope, undefined, {
        format: 'market_roundup',
        publicChartBaseUrl: 'https://charts.theintraday.com',
      })

      expect(singleStockDraft.draft.ticker).toBe('TBD')
      expect(singleStockDraft.draft.manualDraft).toBe(true)
      expect(singleStockDraft.draft.subjectLine).toBe('Untitled newsletter')
      expect(singleStockDraft.draft.blocks).toHaveLength(3)
      expect(singleStockDraft.draft.blocks[0]?.heading).toBe('New section 1')
      expect(singleStockDraft.draft.blocks[0]?.chartImageUrl).toContain('data:image/svg+xml')
      expect(singleStockDraft.draft.blocks[0]?.chartAlt).toBe('AAPL manual price chart')
      expect(singleStockDraft.draft.blocks[0]?.chartNeedsRegeneration).toBe(true)
      expect(
        'mode' in singleStockDraft.draft.blocks[0]!.chartSpec &&
          singleStockDraft.draft.blocks[0]!.chartSpec.mode,
      ).toBe('price')
      expect(
        'symbol' in singleStockDraft.draft.blocks[0]!.chartSpec &&
          singleStockDraft.draft.blocks[0]!.chartSpec.symbol,
      ).toBe('AAPL')
      expect(
        'chartExportSpec' in singleStockDraft.draft.blocks[0]!.chartSpec &&
          singleStockDraft.draft.blocks[0]!.chartSpec.chartExportSpec?.renderProfile,
      ).toBe('newsletter')
      expect(singleStockDraft.draft.statsCard?.items).toHaveLength(3)
      expect(singleStockDraft.draft.header?.logoUrl).toBe('')

      expect(marketRoundupDraft.draft.subjectLine).toBe('Untitled market roundup')
      expect(marketRoundupDraft.draft.featuredTickers).toEqual([])
      expect(marketRoundupDraft.draft.statsCard).toBeUndefined()

      const drafts = await listNewsletterDrafts(scope)
      const roundupSummary = drafts.find((draft) => draft.id === marketRoundupDraft.id)

      expect(roundupSummary?.featuredTickers).toEqual([])
    } finally {
      rmSync(sessionDir, {
        recursive: true,
        force: true,
      })
    }
  })

  it('rejects a stale draft save instead of overwriting a concurrent edit', async () => {
    const scope = {
      ownerId: null,
      sessionId: `test-session-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const original = await createBlankNewsletterDraft(scope, 'AAPL', {
        publicChartBaseUrl: 'https://charts.theintraday.com',
      })
      const first = await saveNewsletterDraft(
        scope,
        original.id,
        { ...original.draft, subjectLine: 'The first durable edit' },
        'draft',
        { expectedUpdatedAt: original.updatedAt },
      )

      await expect(
        saveNewsletterDraft(
          scope,
          original.id,
          { ...original.draft, subjectLine: 'A stale overwrite' },
          'draft',
          { expectedUpdatedAt: original.updatedAt },
        ),
      ).rejects.toBeInstanceOf(NewsletterDraftConflictError)

      expect((await getNewsletterDraft(scope, original.id)).subjectLine).toBe(
        first.subjectLine,
      )
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })

  it('never lets an automated stale write regress a published draft', async () => {
    const scope = {
      ownerId: null,
      sessionId: `test-session-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const original = await createBlankNewsletterDraft(scope, 'AAPL', {
        publicChartBaseUrl: 'https://charts.theintraday.com',
      })
      const publication = {
        beehiivUrl: 'https://theintraday.beehiiv.com/p/apple',
        publishedAt: '2026-08-06T13:00:00.000Z',
      }
      await saveNewsletterDraft(
        scope,
        original.id,
        { ...original.draft, publication },
        'published',
        { expectedUpdatedAt: original.updatedAt },
      )

      await expect(
        saveNewsletterDraft(
          scope,
          original.id,
          {
            ...original.draft,
            subjectLine: 'Stale finalizer copy',
            publication: {
              beehiivUrl: 'https://attacker.example/stale-publication',
              publishedAt: '2000-01-01T00:00:00.000Z',
            },
          },
          'published',
          {
            expectedUpdatedAt: original.updatedAt,
            protectPublished: true,
          },
        ),
      ).rejects.toBeInstanceOf(NewsletterDraftConflictError)

      const protectedResult = await getNewsletterDraft(scope, original.id)
      expect(protectedResult).toMatchObject({
        status: 'published',
        beehiivUrl: publication.beehiivUrl,
        publishedAt: publication.publishedAt,
      })
      expect(protectedResult.draft.publication).toEqual(publication)

      await expect(
        saveNewsletterDraft(
          scope,
          original.id,
          { ...protectedResult.draft, subjectLine: 'Rewrite published copy' },
          'published',
          { expectedUpdatedAt: protectedResult.updatedAt },
        ),
      ).rejects.toBeInstanceOf(NewsletterPublishedDraftImmutableError)
      await expect(deleteNewsletterDraft(scope, original.id)).rejects.toBeInstanceOf(
        NewsletterPublishedDraftImmutableError,
      )
      await expect(getNewsletterDraft(scope, original.id)).resolves.toMatchObject({
        status: 'published',
        beehiivUrl: publication.beehiivUrl,
      })
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })

  it('forks a published issue into an editable copy without losing its exact chart provenance', async () => {
    const scope = {
      ownerId: null,
      sessionId: `test-session-${randomUUID()}`,
    }
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)

    try {
      const sourceDocument = {
        ...buildNewsletterDraftFromResult(
          sampleResult,
          'https://charts.theintraday.com',
        ),
        publication: {
          beehiivUrl: 'https://theintraday.beehiiv.com/p/apple-snapshot',
          publishedAt: '2026-08-06T13:00:00.000Z',
        },
      }
      const source = await createNewsletterDraftFromDocument(
        scope,
        sourceDocument,
        {
          status: 'published',
          publicChartBaseUrl: 'https://charts.theintraday.com',
        },
      )
      const exactProvenance = source.draft.blocks[0]?.chartProvenance
      expect(exactProvenance).toBeTruthy()

      const workingDraft = {
        ...source.draft,
        subjectLine: 'An unsaved local rewrite',
        blocks: source.draft.blocks.map((block, index) =>
          index === 0
            ? { ...block, body: 'Unsaved commentary kept in the copy.' }
            : block,
        ),
      }
      const idempotencyKey = 'fork-published-draft-test-001'

      const forked = await forkNewsletterDraft(
        scope,
        source.id,
        workingDraft,
        {
          idempotencyKey,
          publicChartBaseUrl: 'https://charts.theintraday.com',
        },
      )

      expect(forked).toMatchObject({
        status: 'draft',
        beehiivUrl: null,
        publishedAt: null,
        archivedAt: null,
        subjectLine: 'Copy of An unsaved local rewrite',
      })
      expect(forked.id).not.toBe(source.id)
      expect(forked.draft).toMatchObject({
        manualDraft: true,
        source: undefined,
        publication: undefined,
      })
      expect(forked.draft.blocks[0]?.body).toBe(
        'Unsaved commentary kept in the copy.',
      )
      expect(forked.draft.blocks[0]?.chartProvenance).toEqual(exactProvenance)
      expect(forked.history).toEqual([
        expect.objectContaining({
          type: 'created',
          metadata: expect.objectContaining({
            forkedFromDraftId: source.id,
            forkedFromUpdatedAt: source.updatedAt,
          }),
        }),
      ])

      rmSync(resolve(sessionDir, `${source.id}.json`))
      const replay = await forkNewsletterDraft(
        scope,
        source.id,
        workingDraft,
        {
          idempotencyKey,
          publicChartBaseUrl: 'https://charts.theintraday.com',
        },
      )
      expect(replay.id).toBe(forked.id)
      expect(replay.history).toHaveLength(1)

      await expect(
        forkNewsletterDraft(
          scope,
          source.id,
          { ...workingDraft, subjectLine: 'Different local rewrite' },
          {
            idempotencyKey,
            publicChartBaseUrl: 'https://charts.theintraday.com',
          },
        ),
      ).rejects.toBeInstanceOf(NewsletterDraftIdempotencyConflictError)
    } finally {
      rmSync(sessionDir, { recursive: true, force: true })
    }
  })

  it('deletes local-session drafts so rows disappear from recent drafts', async () => {
    const scope = {
      ownerId: null,
      sessionId: `test-session-${randomUUID()}`,
    }
    const draftId = randomUUID()
    const draft = buildNewsletterDraftFromResult(
      sampleResult,
      'https://charts.theintraday.com',
    )
    const sessionDir = resolve('.newsletter-drafts', scope.sessionId)
    const filePath = resolve(sessionDir, `${draftId}.json`)
    const previewHtml = renderNewsletterDraftPreviewHtml(
      draft,
      'https://charts.theintraday.com',
    )
    const timestamp = new Date().toISOString()

    try {
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(
        filePath,
        JSON.stringify(
          {
            id: draftId,
            owner_id: null,
            session_id: scope.sessionId,
            ticker: draft.ticker,
            status: 'draft',
            subject_line: draft.subjectLine,
            preview_html: previewHtml,
            draft_json: draft,
            created_at: timestamp,
            updated_at: timestamp,
          },
          null,
          2,
        ),
      )

      expect(await listNewsletterDrafts(scope)).toHaveLength(1)

      await deleteNewsletterDraft(scope, draftId)

      expect(await listNewsletterDrafts(scope)).toHaveLength(0)
    } finally {
      rmSync(sessionDir, {
        recursive: true,
        force: true,
      })
    }
  })
})
