import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const mocked = {
    ...actual,
    writeFileSync: vi.fn(),
  }
  return {
    ...mocked,
    default: mocked,
  }
})

import { writeFileSync } from 'fs'
import { captureChart, getChartingPlatformRenderUrl } from '@/lib/newsletter/capture'

describe('newsletter capture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts the mapped capture spec to the Charting Platform render API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const outputPath = '/tmp/aapl.png'
    await captureChart(
      {
        stocks: ['AAPL'],
        metrics: ['revenue', 'net_income'],
        title: 'AAPL Revenue vs Net Income',
      },
      {
        outputPath,
        chartBaseUrl: 'https://charts.theintraday.com/',
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://charts.theintraday.com/tos/api/newsletter/render')

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Accept: 'image/png',
      'Content-Type': 'application/json',
    })

    const body = JSON.parse(String(init?.body))
    expect(body.timeoutMs).toBe(30000)
    expect(body.spec.mode).toBe('fundamentals')
    expect(body.spec.ticker).toBe('AAPL')
    expect(body.spec.width).toBe(620)
    expect(body.spec.height).toBe(440)
    expect(body.spec.fundState.visibleMetrics).toEqual(['revenue', 'netIncome'])

    expect(writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer))
  })

  it('surfaces JSON render API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'render exploded' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(() =>
      captureChart(
        {
          stocks: ['MSFT'],
          metrics: ['free_cash_flow'],
        },
        {
          outputPath: '/tmp/msft.png',
          chartBaseUrl: 'https://charts.theintraday.com',
        },
      ),
    ).rejects.toThrow('Chart render failed: render exploded')
  })

  it('retries a rate-limited render using Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Too many chart export render requests. Try again later.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '0',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NEWSLETTER_RENDER_API_KEY', 'local-render-key')

    await captureChart(
      {
        stocks: ['META'],
        metrics: ['revenue'],
      },
      {
        outputPath: '/tmp/meta.png',
        chartBaseUrl: 'https://charts.theintraday.com',
        maxAttempts: 2,
        retryDelayMs: 0,
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Newsletter-Render-Key': 'local-render-key',
    })
    expect(writeFileSync).toHaveBeenCalledWith(
      '/tmp/meta.png',
      expect.any(Buffer),
    )
  })

  it('posts price-tab specs to the render API without forcing fundamentals mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await captureChart(
      {
        mode: 'price',
        symbol: 'NVDA',
        range: '1y',
        interval: 'D',
        chartType: 'line',
        priceState: {
          indicators: [{ kind: 'macd', panel: 'lower-1' }],
          sessionVisibility: 'regularOnly',
          themeColors: {
            sessionPreBg: 'rgba(255, 255, 255, 0.031)',
            sessionPostBg: 'rgba(255, 255, 255, 0.031)',
          },
          drawings: [
            {
              id: 'draw-1',
              type: 'arrow',
              anchors: [
                { barIndex: 88, price: 244.2 },
                { barIndex: 108, price: 236.7 },
              ],
              style: { color: '#111827', width: 3 },
            },
          ],
          volumeVisible: false,
          viewport: { startIndex: 88, visibleBars: 44 },
        },
      },
      {
        outputPath: '/tmp/nvda.png',
        chartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.spec.mode).toBe('price')
    expect(body.spec.ticker).toBe('NVDA')
    expect(body.spec.range).toBe('1y')
    expect(body.spec.interval).toBe('D')
    expect(body.spec.chartType).toBe('line')
    expect(body.spec.priceState).toMatchObject({
      symbol: 'NVDA',
      ticker: 'NVDA',
      range: '1y',
      interval: 'D',
      chartType: 'line',
      sessionVisibility: 'regularOnly',
      themeColors: {
        sessionPreBg: 'rgba(255, 255, 255, 0.031)',
        sessionPostBg: 'rgba(255, 255, 255, 0.031)',
      },
      volumeVisible: false,
      viewport: { startIndex: 88, visibleBars: 44 },
      drawings: [
        {
          id: 'draw-1',
          type: 'arrow',
          anchors: [
            { barIndex: 88, price: 244.2 },
            { barIndex: 108, price: 236.7 },
          ],
          style: { color: '#111827', width: 3 },
        },
      ],
      indicators: [{ kind: 'macd', panel: 'lower-1' }],
    })
    expect(body.spec.fundState).toBeUndefined()
  })

  it('upgrades lightweight price export specs before rendering', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await captureChart(
      {
        mode: 'price',
        symbol: 'TSLA',
        range: '1m',
        interval: 'D',
        chartType: 'candles',
        chartExportSpec: {
          symbol: 'TSLA',
          range: '1m',
          interval: 'D',
          chartType: 'candles',
          theme: 'light',
          width: 620,
          height: 440,
          renderProfile: 'newsletter',
          viewportTimeRange: {
            startTime: 1_767_206_891_703,
            endTime: 1_779_216_491_703,
            visibleBars: 109,
          },
          dataTimeRange: {
            startTime: 1_745_002_091_703,
            endTime: 1_779_216_491_703,
          },
        },
      },
      {
        outputPath: '/tmp/tsla.png',
        chartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://charts.theintraday.com/api/chart-export/render',
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.spec.width).toBe(1860)
    expect(body.spec.height).toBe(1320)
    expect(body.spec.companyName).toBe('TSLA - Daily')
    expect(body.spec.viewportTimeRange.visibleBars).toBe(109)
    expect(body.spec.exportOptions).toMatchObject({
      displayWidth: 620,
      displayHeight: 440,
      exportScale: 3,
      visibleRange: 'current',
      chartTitle: 'TSLA - Daily',
    })
  })

  it('falls back to the legacy price renderer when the export route is unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Cannot POST /api/chart-export/render', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([7, 8, 9]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await captureChart(
      {
        mode: 'price',
        symbol: 'LII',
        range: '6m',
        interval: 'D',
        chartType: 'candles',
        chartExportSpec: {
          symbol: 'LII',
          range: '6m',
          interval: 'D',
          chartType: 'candles',
          theme: 'light',
          width: 1860,
          height: 1320,
          renderProfile: 'newsletter',
        },
      },
      {
        outputPath: '/tmp/lii.png',
        chartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://charts.theintraday.com/api/chart-export/render',
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://charts.theintraday.com/tos/api/newsletter/render',
    )
    const fallbackBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    )
    expect(fallbackBody.spec).toMatchObject({
      mode: 'price',
      ticker: 'LII',
      symbol: 'LII',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
      theme: 'light',
      width: 1860,
      height: 1320,
    })
    expect(writeFileSync).toHaveBeenCalledWith(
      '/tmp/lii.png',
      expect.any(Buffer),
    )
  })

  it('does not hide export-route authentication failures behind the legacy renderer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid render API key' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(() =>
      captureChart(
        {
          mode: 'price',
          symbol: 'LII',
          range: '6m',
          interval: 'D',
          chartType: 'candles',
          chartExportSpec: {
            symbol: 'LII',
            range: '6m',
            interval: 'D',
            chartType: 'candles',
            theme: 'light',
          },
        },
        {
          outputPath: '/tmp/lii-auth-error.png',
          chartBaseUrl: 'https://charts.theintraday.com',
        },
      ),
    ).rejects.toThrow('Chart export render failed: Invalid render API key')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves saved price export typography when rendering', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await captureChart(
      {
        mode: 'price',
        symbol: 'TSLA',
        range: '1m',
        interval: 'D',
        chartType: 'candles',
        chartExportSpec: {
          symbol: 'TSLA',
          range: '1m',
          interval: 'D',
          chartType: 'candles',
          theme: 'light',
          exportOptions: {
            displayWidth: 620,
            displayHeight: 440,
            exportScale: 3,
            chartTitle: 'TSLA - Daily',
            titleSize: 42,
            axisLabelSize: 13,
          },
          themeOverrides: {
            fontSizeHeader: 42,
            fontSizeTick: 13,
            fontSizeTimeAxis: 13,
          },
        },
      },
      {
        outputPath: '/tmp/tsla-typography.png',
        chartBaseUrl: 'https://charts.theintraday.com',
      },
    )

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.spec.exportOptions).toMatchObject({
      titleSize: 42,
      axisLabelSize: 13,
    })
    expect(body.spec.themeOverrides).toMatchObject({
      fontSizeHeader: 42,
      fontSizeTick: 13,
      fontSizeTimeAxis: 13,
    })
  })

  it('normalizes the render endpoint url', () => {
    expect(getChartingPlatformRenderUrl('https://charts.theintraday.com/')).toBe(
      'https://charts.theintraday.com/tos/api/newsletter/render',
    )
  })
})
