import { describe, expect, it } from 'vitest'

import type { NewsletterResult } from '@/lib/newsletter/types'
import {
  buildNewsletterDraftFromResult,
  normalizeNewsletterDraftDocument,
  renderNewsletterDraftPreviewHtml,
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
})
