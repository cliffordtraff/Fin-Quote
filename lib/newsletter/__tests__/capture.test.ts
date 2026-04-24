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
    expect(body.spec.width).toBe(1400)
    expect(body.spec.height).toBe(960)
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

  it('normalizes the render endpoint url', () => {
    expect(getChartingPlatformRenderUrl('https://charts.theintraday.com/')).toBe(
      'https://charts.theintraday.com/tos/api/newsletter/render',
    )
  })
})
