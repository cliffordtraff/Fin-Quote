import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChartExportSpec } from '@/types/chart-export'
import type { PriceNewsletterChartSpec } from '@/lib/newsletter/types'
import {
  DEFAULT_LOCAL_CHARTING_BASE_URL,
  buildRelativeChartingPlatformCapturePath,
  buildRelativeChartingPlatformDashboardFundamentalsSurfacePath,
  getDefaultChartingBaseUrlForHost,
  getDefaultPublicChartingBaseUrlForHost,
  isLocalChartingHost,
  resolveChartingPlatformDashboardFundamentalsSurfacePath,
  resolveChartingPlatformNewsletterChart,
  resolveChartingPlatformNewsletterCapturePath,
} from '@/lib/newsletter/charting-platform-export'

function decodeBase64UrlJson<T>(rawValue: string): T {
  let normalized = rawValue.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as T
}

describe('resolveChartingPlatformNewsletterChart', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('treats localhost app hosts as local charting hosts', () => {
    expect(isLocalChartingHost('localhost:3005')).toBe(true)
    expect(isLocalChartingHost('127.0.0.1:3005')).toBe(true)
    expect(isLocalChartingHost('[::1]:3005')).toBe(true)
    expect(isLocalChartingHost('app.theintraday.com')).toBe(false)
  })

  it('keeps rendering local but gives drafts a public HTTPS chart URL when overrides are absent', () => {
    const originalChartUrl = process.env.NEXT_PUBLIC_CHARTING_URL
    const originalPublicUrl = process.env.NEWSLETTER_PUBLIC_CHARTING_URL

    delete process.env.NEXT_PUBLIC_CHARTING_URL
    delete process.env.NEWSLETTER_PUBLIC_CHARTING_URL

    try {
      expect(getDefaultChartingBaseUrlForHost('localhost:3005')).toBe(
        DEFAULT_LOCAL_CHARTING_BASE_URL,
      )
      expect(getDefaultPublicChartingBaseUrlForHost('localhost:3005')).toBe(
        'https://charts.theintraday.com',
      )
    } finally {
      if (originalChartUrl === undefined) {
        delete process.env.NEXT_PUBLIC_CHARTING_URL
      } else {
        process.env.NEXT_PUBLIC_CHARTING_URL = originalChartUrl
      }

      if (originalPublicUrl === undefined) {
        delete process.env.NEWSLETTER_PUBLIC_CHARTING_URL
      } else {
        process.env.NEWSLETTER_PUBLIC_CHARTING_URL = originalPublicUrl
      }
    }
  })

  it('never lets a production Host header select the localhost renderer', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_CHARTING_URL', 'https://trusted-charts.example')

    expect(getDefaultChartingBaseUrlForHost('localhost:3005')).toBe(
      'https://trusted-charts.example',
    )

    vi.stubEnv('NEXT_PUBLIC_CHARTING_URL', '')
    expect(getDefaultChartingBaseUrlForHost('127.0.0.1:3005')).toBe(
      'https://charts.theintraday.com',
    )
  })

  it('keeps local render traffic local while preserving the configured public chart url', () => {
    const originalChartUrl = process.env.NEXT_PUBLIC_CHARTING_URL
    const originalPublicUrl = process.env.NEWSLETTER_PUBLIC_CHARTING_URL

    process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'
    process.env.NEWSLETTER_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'

    try {
      expect(getDefaultChartingBaseUrlForHost('localhost:3005')).toBe(
        DEFAULT_LOCAL_CHARTING_BASE_URL,
      )
      expect(getDefaultPublicChartingBaseUrlForHost('localhost:3005')).toBe(
        'https://charts.theintraday.com',
      )
    } finally {
      if (originalChartUrl === undefined) {
        delete process.env.NEXT_PUBLIC_CHARTING_URL
      } else {
        process.env.NEXT_PUBLIC_CHARTING_URL = originalChartUrl
      }

      if (originalPublicUrl === undefined) {
        delete process.env.NEWSLETTER_PUBLIC_CHARTING_URL
      } else {
        process.env.NEWSLETTER_PUBLIC_CHARTING_URL = originalPublicUrl
      }
    }
  })

  it('builds a Charting Platform capture spec from the legacy newsletter chart spec', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      minYear: 2018,
      maxYear: 2024,
      showStockPrice: true,
      chartType: 'bar',
      showLabels: true,
      title: 'AAPL Revenue vs Net Income',
      subtitle: 'Annual figures in USD',
      colors: {
        revenue: '#102030',
        net_income: '#405060',
      },
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001/',
      width: 1600,
      height: 900,
      theme: 'light',
    })

    const captureUrl = new URL(result.captureUrl)
    expect(captureUrl.origin).toBe('http://localhost:3001')
    expect(captureUrl.pathname).toBe('/tos/export/newsletter')

    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      captureUrl.searchParams.get('spec') || '',
    )
    const fundState = decodedSpec.fundState as Record<string, unknown>

    expect(decodedSpec.mode).toBe('fundamentals')
    expect(decodedSpec.fundSymbol).toBe('AAPL')
    expect(decodedSpec.theme).toBe('light')
    expect(decodedSpec.width).toBe(1600)
    expect(decodedSpec.height).toBe(900)
    expect(fundState.visibleMetrics).toEqual(['revenue', 'netIncome', 'stockPrice'])
    expect(fundState.addedMetrics).toEqual(['revenue', 'netIncome', 'stockPrice'])
    expect(fundState.activeMetric).toBe('revenue')
    expect(fundState.activeSeriesId).toBe('AAPL::revenue')
    expect(fundState.chartTitleCustomized).toBe(true)
    expect(fundState.chartTitleText).toBe('AAPL Revenue vs Net Income')
    expect(fundState.metricColors).toEqual({
      revenue: '#102030',
      netIncome: '#405060',
    })
  })

  it('can emit relative same-origin capture paths for proxied embeds', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      chartType: 'bar',
    }

    const capturePath = resolveChartingPlatformNewsletterCapturePath(legacySpec, {
      width: 640,
      height: 360,
      theme: 'dark',
    })

    expect(capturePath.startsWith('/tos/export/newsletter?spec=')).toBe(true)

    const captureUrl = new URL(capturePath, 'https://app.theintraday.com')
    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      captureUrl.searchParams.get('spec') || '',
    )

    expect(decodedSpec.theme).toBe('dark')
    expect(decodedSpec.width).toBe(640)
    expect(decodedSpec.height).toBe(360)
  })

  it('can build a relative path from an existing capture spec payload', () => {
    const path = buildRelativeChartingPlatformCapturePath({
      version: 1,
      mode: 'fundamentals',
      ticker: 'AAPL',
      theme: 'light',
    })

    const url = new URL(path, 'https://app.theintraday.com')
    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      url.searchParams.get('spec') || '',
    )

    expect(url.pathname).toBe('/tos/export/newsletter')
    expect(decodedSpec.ticker).toBe('AAPL')
  })

  it('can build a dashboard fundamentals surface path from an existing capture spec payload', () => {
    const path = buildRelativeChartingPlatformDashboardFundamentalsSurfacePath({
      version: 1,
      mode: 'fundamentals',
      ticker: 'AAPL',
      theme: 'dark',
    })

    const url = new URL(path, 'https://app.theintraday.com')
    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      url.searchParams.get('spec') || '',
    )

    expect(url.pathname).toBe('/tos/dashboard/fundamentals')
    expect(decodedSpec.ticker).toBe('AAPL')
    expect(decodedSpec.theme).toBe('dark')
  })

  it('builds a dashboard fundamentals surface path with dashboard-safe fund state', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      chartType: 'bar',
    }

    const path = resolveChartingPlatformDashboardFundamentalsSurfacePath(legacySpec, {
      width: 640,
      height: 360,
      theme: 'dark',
    })

    const url = new URL(path, 'https://app.theintraday.com')
    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      url.searchParams.get('spec') || '',
    )
    const fundState = decodedSpec.fundState as Record<string, unknown>

    expect(url.pathname).toBe('/tos/dashboard/fundamentals')
    expect(decodedSpec.width).toBe(640)
    expect(decodedSpec.height).toBe(360)
    expect(fundState.sliderOnlyMode).toBe(true)
    expect(fundState.showTooltip).toBe(false)
    expect(fundState.hoverFocusEnabled).toBe(false)
  })

  it('builds a fundamentals workspace URL for click-through links', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['MSFT'],
      metrics: ['gross_margin'],
      periodType: 'quarterly',
      chartType: 'area',
      showLabels: false,
      indexToZero: true,
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'https://charts.theintraday.com',
      theme: 'dark',
    })

    const interactiveUrl = new URL(result.interactiveUrl)
    expect(interactiveUrl.origin).toBe('https://charts.theintraday.com')
    expect(interactiveUrl.pathname).toBe('/tos/MSFT')
    expect(interactiveUrl.searchParams.get('view')).toBe('fundamentals')
    expect(interactiveUrl.searchParams.get('theme')).toBe('dark')
    expect(interactiveUrl.searchParams.get('fundSymbol')).toBe('MSFT')

    const fundState = decodeBase64UrlJson<Record<string, unknown>>(
      interactiveUrl.searchParams.get('fundState') || '',
    )
    expect(fundState.workspaceMode).toBe('fundamentals')
    expect(fundState.period).toBe('quarter')
    expect(fundState.chartType).toBe('area')
    expect(fundState.showLabels).toBe(false)
    expect(fundState.indexed).toBe(true)
    expect(fundState.visibleMetrics).toEqual(['grossMargin'])
    expect(fundState.chartTitleCustomized).toBe(false)
    expect(fundState.chartTitleText).toBe('')
  })

  it('maps compare symbols and derived ratio metrics for the new fundamentals engine', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['NVDA', 'AMD', 'QCOM'],
      metrics: ['debt_to_equity_ratio', 'rd_pct_revenue'],
      periodType: 'annual',
      chartType: 'line',
      colors: {
        debt_to_equity_ratio: '#223344',
        rd_pct_revenue: '#556677',
      },
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001',
    })

    expect(result.fundState).toBeDefined()
    expect(result.fundState?.compareSymbols).toEqual(['AMD', 'QCOM'])
    expect(result.fundState?.visibleMetrics).toEqual([
      'debtEquityRatio',
      'rdPctRevenue',
    ])
    expect(result.fundState?.activeMetric).toBe('debtEquityRatio')
    expect(result.fundState?.metricColors).toEqual({
      debtEquityRatio: '#223344',
      rdPctRevenue: '#556677',
    })
  })

  it('supports shares outstanding in newsletter chart exports', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['eps', 'sharesOutstanding'],
      periodType: 'annual',
      chartType: 'bar',
      colors: {
        eps: '#223344',
        sharesOutstanding: '#556677',
      },
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001',
    })

    expect(result.fundState?.visibleMetrics).toEqual([
      'eps',
      'sharesOutstanding',
    ])
    expect(result.fundState?.metricColors).toEqual({
      eps: '#223344',
      sharesOutstanding: '#556677',
    })
  })

  it('supports extended financial metrics used by the chart editor', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: [
        'depreciation_amortization',
        'stock_based_comp',
        'stock_buybacks',
        'ps_ratio',
      ],
      periodType: 'annual',
      chartType: 'bar',
      colors: {
        depreciation_amortization: '#112233',
        stock_based_comp: '#223344',
        stock_buybacks: '#334455',
        ps_ratio: '#445566',
      },
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001',
    })

    expect(result.fundState?.visibleMetrics).toEqual([
      'depreciationAmortization',
      'stockBasedCompensation',
      'commonStockRepurchased',
      'priceSalesRatio',
    ])
    expect(result.fundState?.metricColors).toEqual({
      depreciationAmortization: '#112233',
      stockBasedCompensation: '#223344',
      commonStockRepurchased: '#334455',
      priceSalesRatio: '#445566',
    })
  })

  it('removes trailing year-range suffixes from newsletter chart titles', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['net_income', 'free_cash_flow'],
      periodType: 'annual',
      chartType: 'bar',
      title: 'AAPL Net Income vs Free Cash Flow (2020–2026)',
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001',
    })

    expect(result.fundState?.chartTitleCustomized).toBe(true)
    expect(result.fundState?.chartTitleText).toBe('AAPL Net Income vs Free Cash Flow')
  })

  it('falls back to generic snake_case to camelCase metric mapping', () => {
    const legacySpec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['mystery_metric'],
    }

    const result = resolveChartingPlatformNewsletterChart(legacySpec, {
      chartBaseUrl: 'http://localhost:3001',
    })

    expect(result.fundState?.visibleMetrics).toEqual(['mysteryMetric'])
  })

  it('builds a real price-tab export spec for price newsletter charts', () => {
    const priceSpec: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'TSLA',
      range: '6m',
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
              { barIndex: 144, price: 248.6 },
              { barIndex: 170, price: 236.2 },
            ],
            style: { color: '#111827', width: 3 },
          },
        ],
        volumeVisible: false,
        viewport: { startIndex: 144, visibleBars: 58 },
      },
      title: 'TSLA Price Trend (6M)',
    }

    const result = resolveChartingPlatformNewsletterChart(priceSpec, {
      chartBaseUrl: 'https://charts.theintraday.com',
      width: 1600,
      height: 900,
      theme: 'light',
    })

    const captureUrl = new URL(result.captureUrl)
    const decodedSpec = decodeBase64UrlJson<Record<string, unknown>>(
      captureUrl.searchParams.get('spec') || '',
    )

    expect(decodedSpec.mode).toBe('price')
    expect(decodedSpec.ticker).toBe('TSLA')
    expect(decodedSpec.range).toBe('6m')
    expect(decodedSpec.interval).toBe('D')
    expect(decodedSpec.chartType).toBe('line')
    expect(decodedSpec.priceState).toMatchObject({
      symbol: 'TSLA',
      ticker: 'TSLA',
      range: '6m',
      interval: 'D',
      chartType: 'line',
      sessionVisibility: 'regularOnly',
      themeColors: {
        sessionPreBg: 'rgba(255, 255, 255, 0.031)',
        sessionPostBg: 'rgba(255, 255, 255, 0.031)',
      },
      volumeVisible: false,
      viewport: { startIndex: 144, visibleBars: 58 },
      drawings: [
        {
          id: 'draw-1',
          type: 'arrow',
          anchors: [
            { barIndex: 144, price: 248.6 },
            { barIndex: 170, price: 236.2 },
          ],
          style: { color: '#111827', width: 3 },
        },
      ],
      indicators: [{ kind: 'macd', panel: 'lower-1' }],
    })
    expect(result.fundState).toBeUndefined()

    const interactiveUrl = new URL(result.interactiveUrl)
    expect(interactiveUrl.pathname).toBe('/tos/TSLA')
    expect(interactiveUrl.searchParams.get('view')).toBe('price')
    expect(interactiveUrl.searchParams.get('range')).toBe('6m')
    expect(interactiveUrl.searchParams.get('interval')).toBe('D')
    expect(interactiveUrl.searchParams.get('chartType')).toBe('line')
    const interactivePriceState = decodeBase64UrlJson<Record<string, unknown>>(
      interactiveUrl.searchParams.get('priceState') || '',
    )
    expect(interactivePriceState).toMatchObject({
      symbol: 'TSLA',
      ticker: 'TSLA',
      range: '6m',
      interval: 'D',
      chartType: 'line',
      sessionVisibility: 'regularOnly',
      volumeVisible: false,
      viewport: { startIndex: 144, visibleBars: 58 },
    })
  })
})
