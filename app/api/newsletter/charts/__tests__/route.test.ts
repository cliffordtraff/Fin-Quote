import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureChart: vi.fn(),
}))

vi.mock('@/lib/newsletter/capture', () => ({
  captureChart: mocks.captureChart,
}))

import { OPTIONS, POST } from '@/app/api/newsletter/charts/route'
import { newsletterChartPostAdmissionTestOnly } from '@/lib/newsletter/chart-post-admission'
import {
  isAllowedNewsletterChartOrigin,
  resolveNewsletterChartBaseUrl,
} from '@/lib/newsletter/chart-api-origin'

const originalChartingUrl = process.env.NEXT_PUBLIC_CHARTING_URL
const originalPublicChartingUrl = process.env.NEWSLETTER_PUBLIC_CHARTING_URL

function buildRequest(origin?: string): NextRequest {
  const headers = new Headers({ host: 'finquote.example' })
  if (origin) headers.set('origin', origin)

  return new NextRequest('https://finquote.example/api/newsletter/charts', {
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  newsletterChartPostAdmissionTestOnly.reset()
  process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.example'
  process.env.NEWSLETTER_PUBLIC_CHARTING_URL = 'https://charts-public.example'
})

afterEach(() => {
  if (originalChartingUrl === undefined) {
    delete process.env.NEXT_PUBLIC_CHARTING_URL
  } else {
    process.env.NEXT_PUBLIC_CHARTING_URL = originalChartingUrl
  }

  if (originalPublicChartingUrl === undefined) {
    delete process.env.NEWSLETTER_PUBLIC_CHARTING_URL
  } else {
    process.env.NEWSLETTER_PUBLIC_CHARTING_URL = originalPublicChartingUrl
  }
})

describe('newsletter chart API origin checks', () => {
  it('allows same-origin and configured charting clients', () => {
    expect(
      isAllowedNewsletterChartOrigin(buildRequest('https://finquote.example')),
    ).toBe(true)
    expect(
      isAllowedNewsletterChartOrigin(buildRequest('https://charts.example')),
    ).toBe(true)
    expect(
      isAllowedNewsletterChartOrigin(
        buildRequest('https://charts-public.example'),
      ),
    ).toBe(true)
  })

  it('allows requests without an Origin header', () => {
    expect(isAllowedNewsletterChartOrigin(buildRequest())).toBe(true)
  })

  it('rejects unconfigured origins before preflight headers are returned', async () => {
    const request = buildRequest('https://attacker.example')

    expect(isAllowedNewsletterChartOrigin(request)).toBe(false)

    const response = await OPTIONS(request)
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('only resolves capture URLs on configured charting origins', () => {
    const request = buildRequest('https://charts.example')

    expect(resolveNewsletterChartBaseUrl(request, undefined)).toBe(
      'https://charts.example',
    )
    expect(
      resolveNewsletterChartBaseUrl(
        request,
        'https://charts-public.example/arbitrary/path',
      ),
    ).toBe('https://charts-public.example')
    expect(() =>
      resolveNewsletterChartBaseUrl(request, 'http://169.254.169.254/latest/meta-data'),
    ).toThrow('configured charting origin')
    expect(() =>
      resolveNewsletterChartBaseUrl(
        request,
        'https://user:password@charts.example',
      ),
    ).toThrow('configured charting origin')
  })

  it('rejects an absolute-path symbol before chart capture', async () => {
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/charts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'route-test-traversal',
          Cookie: 'newsletter_draft_session=existing-session',
          origin: 'https://finquote.example',
        },
        body: JSON.stringify({
          title: 'Traversal attempt',
          chartExportSpec: {
            symbol: '/private/tmp/newsletter-chart-escape',
            range: '1m',
            interval: 'D',
            chartType: 'candles',
          },
        }),
      },
    )

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('letters, numbers, dots, and hyphens'),
    })
    expect(mocks.captureChart).not.toHaveBeenCalled()
  })
})
