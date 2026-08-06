import { describe, expect, it } from 'vitest'

import { buildNewsletterBlock } from '@/lib/newsletter/build-block'

describe('buildNewsletterBlock', () => {
  it('uses larger body copy for chart commentary blocks', () => {
    const block = buildNewsletterBlock('chart_plus_commentary', {
      heading: 'Headline',
      body: 'Earnings per share climbed from **$3.31** in 2020 to **$6.15** in 2022.',
      chartImageUrl: 'https://example.com/chart.png',
      chartAlt: 'Example chart',
    })

    expect(block.html).toContain(`font-size:17px`)
    expect(block.html).toContain(`line-height:1.65`)
    expect(block.html).toContain(`<strong>$3.31</strong>`)
  })

  it('renders newsletter charts at the canonical 620px email width with no horizontal chart padding', () => {
    const priceBlock = buildNewsletterBlock('chart_plus_commentary', {
      heading: 'Price block',
      body: 'Price commentary.',
      chartImageUrl: 'https://example.com/price.png',
      chartAlt: 'Price chart',
      chartExportUrl: 'https://charts.theintraday.com/tos/AMD?view=price&theme=light',
    })

    const fundamentalsBlock = buildNewsletterBlock('chart_plus_commentary', {
      heading: 'Fundamentals block',
      body: 'Fundamentals commentary.',
      chartImageUrl: 'https://example.com/fundamentals.png',
      chartAlt: 'Fundamentals chart',
      chartExportUrl: 'https://charts.theintraday.com/tos/AMD?view=fundamentals&theme=light',
    })

    expect(priceBlock.html).toContain(`width="620"`)
    expect(priceBlock.html).toContain(`height="440"`)
    expect(fundamentalsBlock.html).toContain(`width="620"`)
    expect(priceBlock.html).toContain(`padding:8px 20px;text-align:center;`)
    expect(fundamentalsBlock.html).toContain(`padding:8px 20px;text-align:center;`)
  })

  it('rejects unsafe outbound link schemes', () => {
    expect(() =>
      buildNewsletterBlock('chart_plus_commentary', {
        heading: 'Headline',
        body: 'Commentary',
        chartImageUrl: 'https://example.com/chart.png',
        chartAlt: 'Example price chart',
        ctaText: 'Read more',
        ctaUrl: 'javascript:alert(1)',
      }),
    ).toThrow('CTA link must be a public HTTPS URL')
  })

  it('parses malformed body markup through a strict tag-and-attribute allowlist', () => {
    const block = buildNewsletterBlock('chart_plus_commentary', {
      heading: 'Safe body',
      body: '<p onclick="steal()"><strong>Known fact<script>alert(1)</script></strong><a href="javascript:alert(1)">source</a><em>context',
      chartImageUrl: 'https://example.com/chart.png',
      chartAlt: 'Safe example price chart',
    })

    expect(block.html).toContain('<strong>Known fact</strong>')
    expect(block.html).toContain('source')
    expect(block.html).toContain('<em>context</em>')
    expect(block.html).not.toContain('onclick')
    expect(block.html).not.toContain('<script')
    expect(block.html).not.toContain('alert(1)')
    expect(block.html).not.toContain('<a')
  })

  it('removes nested Outlook conditional comments from allowed body tags', () => {
    const block = buildNewsletterBlock('chart_plus_commentary', {
      heading: 'Safe body',
      body: '<p>Visible text<!--[if mso]><v:rect href="javascript:alert(1)"><![endif]--></p>',
      chartImageUrl: 'https://example.com/chart.png',
      chartAlt: 'Safe example price chart',
    })

    expect(block.html).toContain('Visible text')
    expect(block.html).not.toContain('<!--[if')
    expect(block.html).not.toContain('<v:rect')
    expect(block.html).not.toContain('javascript:')
  })
})
