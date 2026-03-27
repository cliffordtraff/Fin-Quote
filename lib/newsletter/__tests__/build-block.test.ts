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
})
