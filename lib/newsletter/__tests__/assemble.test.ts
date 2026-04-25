import { describe, expect, it } from 'vitest'

import {
  assembleNewsletterHtml,
  assembleNewsletterHtmlForBeehiiv,
  buildNewsletterHeader,
  buildNewsletterIntroText,
  buildNewsletterStatsCard,
} from '@/lib/newsletter/assemble'

describe('assembleNewsletterHtml', () => {
  it('does not render the In the News section', () => {
    const html = assembleNewsletterHtml(
      'AAPL',
      [{ layoutId: 'chart_plus_commentary', data: {} as any, html: '<tr><td>Block</td></tr>' }],
      new Date('2026-03-26T12:00:00.000Z'),
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        price: 200,
        change: 1.5,
        changesPercentage: 0.75,
        marketCap: 3_000_000_000_000,
        pe: 30.2,
        ytdReturn: 8.1,
      },
      'Apple extends its manufacturing push.',
      'Apple pops on $400M US manufacturing push',
    )

    expect(html).not.toContain('In the News')
    expect(html).not.toContain('reuters.com')
  })

  it('supports an editable intro text override for draft previews', () => {
    const html = assembleNewsletterHtml(
      'AAPL',
      [{ layoutId: 'chart_plus_commentary', data: {} as any, html: '<tr><td>Block</td></tr>' }],
      new Date('2026-03-26T12:00:00.000Z'),
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        price: 200,
        change: 1.5,
        changesPercentage: 0.75,
      },
      'Original hook text.',
      'Apple subject line',
      { introTextOverride: 'Manual editor intro text.' },
    )

    expect(html).toContain('Manual editor intro text.')
    expect(html).not.toContain('Original hook text.')
  })

  it('builds reusable plain-text intro copy for draft seeding', () => {
    const introText = buildNewsletterIntroText(
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        price: 200,
        change: 1.5,
        changesPercentage: 0.75,
      },
      'Apple extends its manufacturing push.',
    )

    expect(introText).toContain('Apple Inc. (AAPL) is +0.75% (+$1.50) today.')
    expect(introText).toContain('Apple extends its manufacturing push.')
  })

  it('supports an editable stats card override for draft previews', () => {
    const html = assembleNewsletterHtml(
      'TSLA',
      [{ layoutId: 'chart_plus_commentary', data: {} as any, html: '<tr><td>Block</td></tr>' }],
      new Date('2026-03-26T12:00:00.000Z'),
      {
        ticker: 'TSLA',
        name: 'Tesla, Inc.',
        price: 180,
        change: -2,
        changesPercentage: -1.1,
        marketCap: 1_400_000_000_000,
        pe: 223,
        ytdReturn: -15,
      },
      'Tesla delivery guidance misses expectations.',
      'Tesla subject line',
      {
        statsCardOverride: {
          items: [
            { label: 'Market Cap', value: '$1.5T' },
            { label: 'P/E Ratio', value: '210.0x' },
            { label: 'YTD Performance', value: '+12.0%' },
          ],
        },
      },
    )

    expect(html).toContain('newsletter-preview-stats')
    expect(html).toContain('$1.5T')
    expect(html).toContain('210.0x')
    expect(html).toContain('+12.0%')
    expect(html).not.toContain('-15.0%')
  })

  it('builds a reusable stats card from quote data for draft seeding', () => {
    const statsCard = buildNewsletterStatsCard({
      ticker: 'TSLA',
      name: 'Tesla, Inc.',
      price: 180,
      change: -2,
      changesPercentage: -1.1,
      marketCap: 1_400_000_000_000,
      pe: 223,
      ytdReturn: -15,
    })

    expect(statsCard?.items).toEqual([
      { label: 'Market Cap', value: '$1.4T' },
      { label: 'P/E Ratio', value: '223.0x' },
      { label: 'YTD Performance', value: '-15.0%' },
    ])
  })

  it('supports an editable header override for draft previews', () => {
    const html = assembleNewsletterHtml(
      'TSLA',
      [{ layoutId: 'chart_plus_commentary', data: {} as any, html: '<tr><td>Block</td></tr>' }],
      new Date('2026-03-26T12:00:00.000Z'),
      undefined,
      undefined,
      'Tesla subject line',
      {
        headerOverride: {
          title: 'The Intraday Pro',
          dateText: 'March 30, 2026',
          badgeText: 'Tesla Deep Dive',
        },
      },
    )

    expect(html).toContain('newsletter-preview-header')
    expect(html).toContain('The Intraday Pro')
    expect(html).toContain('March 30, 2026')
    expect(html).toContain('Tesla Deep Dive')
    expect(html).not.toContain('TSLA Snapshot')
  })

  it('builds a reusable newsletter header for draft seeding', () => {
    expect(buildNewsletterHeader('TSLA', new Date('2026-03-26T12:00:00.000Z'))).toEqual({
      title: 'TSLA Snapshot',
      dateText: 'March 26, 2026',
      badgeText: 'TSLA Snapshot',
      logoUrl: 'https://financialmodelingprep.com/image-stock/TSLA.png',
    })
  })

  it('builds a market roundup header with a logo grid for 2+ featured tickers', () => {
    expect(
      buildNewsletterHeader('MARKET', new Date('2026-03-26T12:00:00.000Z'), {
        format: 'market_roundup',
        featuredTickers: ['AAPL', 'MSFT', 'NVDA', 'TSLA'],
      }),
    ).toEqual({
      title: 'Market Roundup — 4 Stocks',
      dateText: 'March 26, 2026',
      badgeText: 'Market Roundup • 4 Stocks',
      logoUrls: [
        'https://financialmodelingprep.com/image-stock/AAPL.png',
        'https://financialmodelingprep.com/image-stock/MSFT.png',
        'https://financialmodelingprep.com/image-stock/NVDA.png',
        'https://financialmodelingprep.com/image-stock/TSLA.png',
      ],
    })
  })

  it('builds a market roundup header using the single ticker logo when only 1 is featured', () => {
    expect(
      buildNewsletterHeader('MARKET', new Date('2026-03-26T12:00:00.000Z'), {
        format: 'market_roundup',
        featuredTickers: ['NVDA'],
      }),
    ).toEqual({
      title: 'Market Roundup — 1 Stocks',
      dateText: 'March 26, 2026',
      badgeText: 'Market Roundup • 1 Stocks',
      logoUrl: 'https://financialmodelingprep.com/image-stock/NVDA.png',
    })
  })

  it('does not render the source footer in Beehiiv snippet HTML', () => {
    const html = assembleNewsletterHtmlForBeehiiv(
      'AAPL',
      [{ layoutId: 'chart_plus_commentary', data: {} as any, html: '<tr><td>Block</td></tr>' }],
      new Date('2026-03-26T12:00:00.000Z'),
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        price: 200,
        change: 1.5,
        changesPercentage: 0.75,
      },
      'Apple extends its manufacturing push.',
      'Apple subject line',
    )

    expect(html).not.toContain('Data sourced from SEC filings and Financial Modeling Prep.')
    expect(html).not.toContain('Charts generated by The Intraday')
  })
})
