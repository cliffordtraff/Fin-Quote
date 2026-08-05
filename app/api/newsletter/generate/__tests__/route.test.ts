import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdmin }
})

vi.mock('@/lib/newsletter/generation', () => ({
  generateNewsletterWithBackend: mocks.generate,
}))

vi.mock('@/lib/newsletter/charting-platform-export', () => ({
  getDefaultChartingBaseUrlForHost: (host: string) => `https://${host}/charts`,
  getDefaultPublicChartingBaseUrlForHost: (host: string) =>
    `https://${host}/public-charts`,
}))

import { AdminAccessError } from '@/lib/auth/admin'
import { POST } from '@/app/api/newsletter/generate/route'

function request(body: unknown = { ticker: 'aapl' }) {
  return new NextRequest('https://www.theintraday.com/api/newsletter/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'www.theintraday.com',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify(body),
  })
}

describe('newsletter generation API', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'editor@example.com' },
      isAdmin: true,
      adminConfigured: true,
    })
    mocks.generate.mockResolvedValue({
      ticker: 'AAPL',
      format: 'single_stock',
      featuredTickers: ['AAPL'],
      generatedAt: '2026-08-05T12:00:00.000Z',
      autoPickedStock: false,
      stockPickerResult: undefined,
      selections: [],
      chartPaths: ['/tmp/chart.png'],
      publishedUrls: {
        'chart.png': 'https://cdn.example.com/chart.png',
      },
      htmlPath: '/tmp/newsletter.html',
      previewPath: null,
      timings: { total: 100 },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects signed-out callers before generation starts', async () => {
    mocks.requireAdmin.mockRejectedValue(
      new AdminAccessError(
        'You must be signed in to access this admin feature.',
      ),
    )

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Authentication required.',
    })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('rejects authenticated non-admin callers before generation starts', async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminAccessError())

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Admin access required.' })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('allows an admin to generate with normalized bounded options', async () => {
    const response = await POST(
      request({
        ticker: ' aapl ',
        format: 'single_stock',
        roundupSize: 99,
        generationPrompt: ' Focus on services growth. ',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ticker: 'AAPL',
      format: 'single_stock',
    })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledWith('AAPL', {
      baseUrl: 'https://www.theintraday.com',
      chartBaseUrl: 'https://www.theintraday.com/charts',
      publicChartBaseUrl: 'https://www.theintraday.com/public-charts',
      editorMode: true,
      publish: true,
      format: 'single_stock',
      roundupSize: 5,
      generationPrompt: 'Focus on services growth.',
    })
  })

  it('validates input only after the admin boundary succeeds', async () => {
    const response = await POST(request({ ticker: 'NOT-A-TICKER' }))

    expect(response.status).toBe(400)
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})
