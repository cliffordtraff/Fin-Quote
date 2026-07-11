import { describe, expect, it } from 'vitest'
import {
  buildWhyMovingDisplayText,
  isFreshWhyMovingResult,
  parseFinvizWhyMovingHtml,
  WHY_MOVING_CACHE_TTL,
} from '@/lib/stock-why-moving'

describe('stock-why-moving parser', () => {
  it('parses the embedded Finviz why-moving payload', () => {
    const html = `
      <html>
        <body>
          <script id="why-stock-moving-init-data-0" type="application/json">
            {"whyMoving":{"ticker":"AAPL","dateTime":"2026-03-24T11:15:22.69","headline":"Apple to introduce paid ads in Apple Maps in the U.S. and Canada this summer","summary":null,"source":"news_summary","sentiment":"good","catalyst":false,"bulletPointsList":["Paid ads will be introduced as part of a revamped Apple Business offering from Apple.","Apple characterizes the initiative as expanding its advertising revenue opportunities."]}}
          </script>
        </body>
      </html>
    `

    const parsed = parseFinvizWhyMovingHtml(html)

    expect(parsed).not.toBeNull()
    expect(parsed?.headline).toContain('Apple to introduce paid ads')
    expect(parsed?.source).toBe('news_summary')
    expect(parsed?.sentiment).toBe('good')
  })

  it('returns null when the why-moving script is absent', () => {
    const parsed = parseFinvizWhyMovingHtml('<html><body><div>No why moving payload</div></body></html>')
    expect(parsed).toBeNull()
  })

  it('returns null for a normal Finviz quote page without why-moving payload', () => {
    const html = `
      <html>
        <head><title>AAPL - Apple Inc Stock Price and Quote</title></head>
        <body>
          <script>
            const featureFlags = {"stockswhymoving":true};
          </script>
          <div>No catalyst payload present</div>
        </body>
      </html>
    `

    const parsed = parseFinvizWhyMovingHtml(html)
    expect(parsed).toBeNull()
  })
})

describe('buildWhyMovingDisplayText', () => {
  it('prefers the Finviz headline for one-line display text', () => {
    const displayText = buildWhyMovingDisplayText({
      headline: 'Analyst upgrades Tesla to Hold with a $383 price target',
      summary: 'This is a longer summary that should not displace the headline.',
      bulletPoints: ['First bullet'],
    })

    expect(displayText).toBe('Analyst upgrades Tesla to Hold with a $383 price target')
  })

  it('falls back to summary and then bullets when headline is missing', () => {
    expect(
      buildWhyMovingDisplayText({
        headline: null,
        summary: 'Revenue guidance was raised after the close.',
        bulletPoints: ['Fallback bullet'],
      })
    ).toBe('Revenue guidance was raised after the close.')

    expect(
      buildWhyMovingDisplayText({
        headline: null,
        summary: null,
        bulletPoints: ['A supplier deal was announced this morning.'],
      })
    ).toBe('A supplier deal was announced this morning.')
  })
})

describe('isFreshWhyMovingResult', () => {
  it('treats found rows as fresh inside the found TTL window', () => {
    const now = Date.parse('2026-06-01T12:00:00.000Z')
    const fetchedAt = new Date(now - WHY_MOVING_CACHE_TTL.foundMs + 60_000).toISOString()

    expect(
      isFreshWhyMovingResult({ status: 'found', fetchedAt }, now),
    ).toBe(true)
  })

  it('treats stale error rows as expired so they can be retried sooner', () => {
    const now = Date.parse('2026-06-01T12:00:00.000Z')
    const fetchedAt = new Date(now - WHY_MOVING_CACHE_TTL.errorMs - 1_000).toISOString()

    expect(
      isFreshWhyMovingResult({ status: 'error', fetchedAt }, now),
    ).toBe(false)
  })
})
