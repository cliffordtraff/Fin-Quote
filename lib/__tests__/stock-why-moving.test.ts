import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFinvizQuoteUrl,
  buildWhyMovingDisplayText,
  isFreshWhyMovingResult,
  getStockWhyMovingData,
  parseFinvizWhyMovingHtml,
  WHY_MOVING_CACHE_TTL,
} from '@/lib/stock-why-moving'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('buildFinvizQuoteUrl', () => {
  it('uses Finviz class-share aliases without changing the canonical symbol', () => {
    expect(buildFinvizQuoteUrl('BRK.B')).toBe('https://finviz.com/quote.ashx?t=BRK-B&p=d')
    expect(buildFinvizQuoteUrl('bf.b')).toBe('https://finviz.com/quote.ashx?t=BF-B&p=d')
  })

  it('leaves standard ticker symbols unchanged', () => {
    expect(buildFinvizQuoteUrl('AAPL')).toBe('https://finviz.com/quote.ashx?t=AAPL&p=d')
  })
})

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

describe('stock why-moving cancellation', () => {
  it('interrupts an in-flight Finviz attempt when the stage lease aborts', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      markFetchStarted?.()
      return (
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) return
          const rejectAbort = () => reject(signal.reason)
          if (signal.aborted) rejectAbort()
          else signal.addEventListener('abort', rejectAbort, { once: true })
        })
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const reason = new Error('lease budget exhausted')
    const result = getStockWhyMovingData('AAPL', {
      forceRefresh: true,
      signal: controller.signal,
    })

    await fetchStarted
    expect(fetchMock).toHaveBeenCalledOnce()
    controller.abort(reason)
    await expect(result).rejects.toBe(reason)
  })
})
