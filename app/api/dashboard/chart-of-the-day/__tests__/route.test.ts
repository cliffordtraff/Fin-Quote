import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  resolveChart: vi.fn(),
  transformDark: vi.fn(),
  fallback: vi.fn(),
  buildIdentity: vi.fn(),
  ensureAsset: vi.fn(),
}))

vi.mock('@/lib/dashboard/chart-of-the-day-settings', () => ({
  getDashboardChartOfTheDaySetting: mocks.getSetting,
}))

vi.mock('@/lib/dashboard/chart-of-the-day', () => ({
  resolveCurrentDashboardChartOfTheDay: mocks.resolveChart,
  transformDashboardChartImageForDarkTheme: mocks.transformDark,
  loadDashboardChartOfTheDayFallbackImage: mocks.fallback,
}))

vi.mock('@/lib/dashboard/chart-render-assets', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/dashboard/chart-render-assets')
  >()
  return {
    ...actual,
    buildDashboardChartRenderIdentity: mocks.buildIdentity,
    ensureDashboardChartRenderAsset: mocks.ensureAsset,
  }
})

import { GET } from '@/app/api/dashboard/chart-of-the-day/route'
import { DashboardChartRenderPendingError } from '@/lib/dashboard/chart-render-assets'

const setting = {
  selection: {
    ticker: 'AAPL',
    templateId: 'revenue_vs_net_income',
    periodType: 'annual',
  },
  chartSpec: {
    stocks: ['AAPL'],
    metrics: ['revenue', 'net_income'],
    periodType: 'annual',
  },
  source: 'template' as const,
  updatedAt: '2026-08-08T10:00:00.000Z',
  updatedBy: 'admin-1',
}

function request(theme: 'light' | 'dark' = 'light') {
  return new NextRequest(
    `https://theintraday.com/api/dashboard/chart-of-the-day?theme=${theme}`,
    { headers: { host: 'localhost:3001' } },
  )
}

describe('dashboard chart-of-the-day image route', () => {
  let settingVersion = 0

  beforeEach(() => {
    vi.clearAllMocks()
    settingVersion += 1
    mocks.getSetting.mockResolvedValue({
      ...setting,
      updatedAt: `2026-08-08T10:${settingVersion.toString().padStart(2, '0')}:00.000Z`,
    })
    mocks.resolveChart.mockResolvedValue({
      renderUrl: 'https://charts.theintraday.com/tos/api/newsletter/render',
      captureSpec: { symbol: 'AAPL' },
    })
    mocks.transformDark.mockImplementation(async (value: Buffer) => value)
    mocks.fallback.mockResolvedValue(null)
    mocks.buildIdentity.mockImplementation(
      (theme: string, currentSetting: typeof setting) => ({
        renderKey: `${theme}:${currentSetting.updatedAt}`,
        theme,
        settingVersion: currentSetting.updatedAt,
        specHash: 'a'.repeat(64),
        rendererVersion: 'test-v1',
      }),
    )
    mocks.ensureAsset.mockImplementation(
      async (options: { render: () => Promise<unknown> }) => {
        await options.render()
        return {
          publicUrl:
            'https://example.supabase.co/storage/v1/object/public/newsletter-charts/immutable/aa/chart.png',
          storagePath: 'immutable/aa/chart.png',
          source: 'rendered',
        }
      },
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('coalesces one hundred concurrent anonymous requests into one render', async () => {
    let finishRender!: (response: Response) => void
    const render = new Promise<Response>((resolve) => {
      finishRender = resolve
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => render)

    const responsesPromise = Promise.all(
      Array.from({ length: 100 }, () => GET(request())),
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    finishRender(
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    const responses = await responsesPromise

    expect(fetchMock).toHaveBeenCalledWith(
      'https://charts.theintraday.com/tos/api/newsletter/render',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(responses.every((response) => response.status === 307)).toBe(true)
    expect(
      responses.filter(
        (response) => response.headers.get('X-Chart-Cache') === 'MISS',
      ),
    ).toHaveLength(1)
    expect(mocks.getSetting).toHaveBeenCalledOnce()
    expect(mocks.ensureAsset).toHaveBeenCalledOnce()
    expect(responses[0].headers.get('Cache-Control')).toContain('s-maxage=300')
    expect(responses[0].headers.get('Location')).toContain(
      '/storage/v1/object/public/newsletter-charts/',
    )
    expect(responses[0].body).toBeNull()
    expect(mocks.resolveChart).toHaveBeenCalledWith(
      { theme: 'light' },
      expect.objectContaining({
        updatedAt: `2026-08-08T10:${settingVersion.toString().padStart(2, '0')}:00.000Z`,
      }),
    )
  })

  it('rejects an oversized renderer response without reading or relaying it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(9 * 1024 * 1024),
        },
      }),
    )

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Chart render failed')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('cancels a chunked renderer body as soon as it crosses the byte cap', async () => {
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4 * 1024 * 1024))
        controller.enqueue(new Uint8Array(5 * 1024 * 1024))
      },
      cancel: cancelled,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it('authenticates the server-side render request when a render key exists', async () => {
    vi.stubEnv('NEWSLETTER_RENDER_API_KEY', 'trusted-render-key')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const response = await GET(request())

    expect(response.status).toBe(307)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Newsletter-Render-Key': 'trusted-render-key',
        }),
      }),
    )
  })

  it('rejects a non-PNG renderer response and sanitizes upstream details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"secret":"renderer detail"}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('renderer detail')
  })

  it('uses a caller-side deadline and falls back safely on renderer timeout', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation timed out', 'TimeoutError'),
    )
    mocks.fallback.mockResolvedValue({
      buffer: Buffer.from([137, 80, 78, 71]),
      contentType: 'image/png',
    })

    const response = await GET(request('dark'))

    expect(response.status).toBe(307)
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.fallback).toHaveBeenCalledWith(
      'dark',
      setting.selection,
      8 * 1024 * 1024,
    )
  })

  it('rejects unknown, duplicate, and non-canonical query parameters', async () => {
    for (const query of [
      '?theme=sepia',
      '?theme=dark&theme=dark',
      '?theme=dark&cacheBust=1',
      '?cacheBust=1',
    ]) {
      const response = await GET(
        new NextRequest(
          `https://theintraday.com/api/dashboard/chart-of-the-day${query}`,
        ),
      )
      expect(response.status).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }

    expect(mocks.getSetting).not.toHaveBeenCalled()
    expect(mocks.ensureAsset).not.toHaveBeenCalled()
  })

  it('canonicalizes an omitted theme and explicit light theme to one asset key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const implicit = await GET(
      new NextRequest('https://theintraday.com/api/dashboard/chart-of-the-day'),
    )
    const explicit = await GET(request('light'))

    expect(implicit.status).toBe(307)
    expect(explicit.status).toBe(307)
    expect(implicit.headers.get('X-Chart-Cache')).toBe('MISS')
    expect(explicit.headers.get('X-Chart-Cache')).toBe('HIT')
    expect(mocks.ensureAsset).toHaveBeenCalledOnce()
  })

  it('returns a bounded retryable error when another isolate owns the lease', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    mocks.ensureAsset.mockRejectedValueOnce(
      new DashboardChartRenderPendingError(37),
    )

    const response = await GET(request('dark'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('37')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).not.toContain('lease')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
