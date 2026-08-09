import { describe, expect, it, vi } from 'vitest'

import {
  parseFundamentalsNewsletterChartSpecFromFundState,
  resolveNewsletterChartEditor,
  parsePriceNewsletterChartSpecFromState,
  resolveNewsletterPriceExportEditor,
  resolveNewsletterPriceChartEditor,
} from '@/lib/newsletter/chart-editor'
import type {
  FundamentalsNewsletterChartSpec,
  PriceNewsletterChartSpec,
} from '@/lib/newsletter/types'

const DAY_MS = 86_400_000

function decodeBase64UrlJson<T>(rawValue: string): T {
  let normalized = rawValue.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as T
}

describe('newsletter price chart editor bridge', () => {
  it('uses saved fundamentals metric chart overrides when rebuilding the newsletter spec', () => {
    const fallback: FundamentalsNewsletterChartSpec = {
      mode: 'fundamentals',
      stocks: ['AMZN'],
      metrics: ['gross_margin'],
      periodType: 'annual',
      chartType: 'line',
      showLabels: true,
      stacked: false,
      indexToZero: false,
      title: 'AMZN Gross Margin',
    }

    const parsed = parseFundamentalsNewsletterChartSpecFromFundState(
      {
        symbol: 'amzn',
        period: 'annual',
        chartType: 'line',
        visibleMetrics: ['grossMargin'],
        addedMetrics: ['grossMargin'],
        activeMetric: 'grossMargin',
        metricChartTypes: {
          grossMargin: 'bar',
        },
        showLabels: true,
      },
      'AMZN',
      fallback,
    )

    expect(parsed).toMatchObject({
      mode: 'fundamentals',
      stocks: ['AMZN'],
      metrics: ['gross_margin'],
      periodType: 'annual',
      chartType: 'bar',
      showLabels: true,
    })
  })

  it('maps newer chart-editor metric ids back into newsletter metric ids', () => {
    const fallback: FundamentalsNewsletterChartSpec = {
      mode: 'fundamentals',
      stocks: ['AAPL'],
      metrics: ['depreciation_amortization'],
      periodType: 'annual',
      chartType: 'bar',
      showLabels: true,
      stacked: false,
      indexToZero: false,
      title: 'AAPL Depreciation & Amortization',
    }

    const parsed = parseFundamentalsNewsletterChartSpecFromFundState(
      {
        symbol: 'aapl',
        period: 'annual',
        chartType: 'bar',
        visibleMetrics: [
          'depreciationAmortization',
          'stockBasedCompensation',
          'commonStockRepurchased',
          'sharesOutstanding',
        ],
        addedMetrics: [
          'depreciationAmortization',
          'stockBasedCompensation',
          'commonStockRepurchased',
          'sharesOutstanding',
        ],
        activeMetric: 'depreciationAmortization',
        showLabels: true,
      },
      'AAPL',
      fallback,
    )

    expect(parsed).toMatchObject({
      mode: 'fundamentals',
      stocks: ['AAPL'],
      metrics: [
        'depreciation_amortization',
        'stock_based_comp',
        'stock_buybacks',
        'shares_outstanding',
      ],
      periodType: 'annual',
      chartType: 'bar',
      showLabels: true,
    })
  })

  it('restores saved price workspace state into the embedded editor iframe', () => {
    const spec: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      priceState: {
        indicators: [{ kind: 'macd', panel: 'lower-1' }],
        priceScale: { min: 212.25, max: 287.75 },
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
              { barIndex: 120, price: 252.5 },
              { barIndex: 150, price: 236.8 },
            ],
            style: { color: '#111827', width: 3 },
          },
        ],
        volumeVisible: false,
        viewport: { startIndex: 120, visibleBars: 64 },
      },
    }

    const resolved = resolveNewsletterPriceChartEditor(spec, { theme: 'light' })
    const iframeUrl = new URL(
      resolved.iframePath,
      'https://charting-proxy.theintraday.invalid',
    )
    const decodedState = decodeBase64UrlJson<Record<string, unknown>>(
      iframeUrl.searchParams.get('priceState') || '',
    )

    expect(iframeUrl.pathname).toBe('/tos/TXN')
    expect(iframeUrl.searchParams.get('embed')).toBe('true')
    expect(iframeUrl.searchParams.get('canvasEditor')).toBe('1')
    expect(iframeUrl.searchParams.get('newsletterEditor')).toBe('1')
    expect(iframeUrl.searchParams.get('newsletterEditorTarget')).toBe('price')
    expect(iframeUrl.searchParams.get('newsletterEditorWidth')).toBe('620')
    expect(iframeUrl.searchParams.get('newsletterEditorHeight')).toBe('440')
    expect(decodedState.symbol).toBe('TXN')
    expect(decodedState.ticker).toBe('TXN')
    expect(decodedState.range).toBe('1m')
    expect(decodedState.interval).toBe('D')
    expect(decodedState.chartType).toBe('candles')
    expect(decodedState.priceScale).toEqual({ min: 212.25, max: 287.75 })
    expect(decodedState.sessionVisibility).toBe('regularOnly')
    expect(decodedState.themeColors).toEqual({
      sessionPreBg: 'rgba(255, 255, 255, 0.031)',
      sessionPostBg: 'rgba(255, 255, 255, 0.031)',
    })
    expect(decodedState.volumeVisible).toBe(false)
    expect(decodedState.viewport).toEqual({ startIndex: 120, visibleBars: 64 })
    expect(decodedState.drawings).toEqual([
      {
        id: 'draw-1',
        type: 'arrow',
        anchors: [
          { barIndex: 120, price: 252.5 },
          { barIndex: 150, price: 236.8 },
        ],
        style: { color: '#111827', width: 3 },
      },
    ])
    expect(decodedState.indicators).toEqual([{ kind: 'macd', panel: 'lower-1' }])
  })

  it('creates an explicit price workspace state for editor loads without a saved snapshot', () => {
    const spec: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
    }

    const resolved = resolveNewsletterPriceChartEditor(spec, { theme: 'light' })
    const iframeUrl = new URL(
      resolved.iframePath,
      'https://charting-proxy.theintraday.invalid',
    )
    const decodedState = decodeBase64UrlJson<Record<string, unknown>>(
      iframeUrl.searchParams.get('priceState') || '',
    )

    expect(decodedState).toEqual({
      symbol: 'TXN',
      ticker: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
    })
    expect(resolved.priceState).toEqual(decodedState)
  })

  it('seeds the export editor with the legacy newsletter lookback zoom for unsaved price charts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T13:34:40.000Z'))

    try {
      const spec: PriceNewsletterChartSpec = {
        mode: 'price',
        symbol: 'GOOGL',
        range: '1m',
        interval: 'D',
        chartType: 'candles',
      }

      const resolved = resolveNewsletterPriceExportEditor(spec, { theme: 'light' })
      const viewportTimeRange = resolved.baseSpec.viewportTimeRange as {
        startTime: number
        endTime: number
        visibleBars: number
      }
      const dataTimeRange = resolved.baseSpec.dataTimeRange as {
        startTime: number
        endTime: number
      }

      expect(resolved.iframePath).toBe('/export-editor')
      expect(resolved.symbol).toBe('GOOGL')
      expect(resolved.baseSpec.range).toBe('1m')
      expect(resolved.baseSpec.interval).toBe('D')
      expect(resolved.baseSpec.width).toBe(1860)
      expect(resolved.baseSpec.height).toBe(1320)
      expect(resolved.baseSpec.companyName).toBe('GOOGL - Daily')
      expect(resolved.baseSpec.exportOptions).toMatchObject({
        displayWidth: 620,
        displayHeight: 440,
        exportScale: 3,
        visibleRange: 'current',
        chartTitle: 'GOOGL - Daily',
        showTitle: true,
        showLowerPane: false,
      })
      expect(viewportTimeRange.endTime).toBe(Date.now())
      expect(viewportTimeRange.visibleBars).toBe(109)
      expect(Math.round((viewportTimeRange.endTime - viewportTimeRange.startTime) / DAY_MS)).toBe(139)
      expect(dataTimeRange.startTime).toBeLessThan(viewportTimeRange.startTime)
      expect(dataTimeRange.endTime).toBe(viewportTimeRange.endTime)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a saved export-editor viewport while adding render defaults', () => {
    const chartExportSpec = {
      symbol: 'GOOGL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      viewportTimeRange: {
        startTime: 1_775_520_000_000,
        endTime: 1_779_206_400_000,
        visibleBars: 42,
      },
      dataTimeRange: {
        startTime: 1_735_603_200_000,
        endTime: 1_779_206_400_000,
      },
    }

    const resolved = resolveNewsletterPriceExportEditor({
      mode: 'price',
      symbol: 'GOOGL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      chartExportSpec,
    })

    expect(resolved.baseSpec).not.toBe(chartExportSpec)
    expect(resolved.baseSpec.viewportTimeRange).toEqual(chartExportSpec.viewportTimeRange)
    expect(resolved.baseSpec.dataTimeRange).toEqual(chartExportSpec.dataTimeRange)
    expect(resolved.baseSpec.width).toBe(1860)
    expect(resolved.baseSpec.height).toBe(1320)
    expect(resolved.baseSpec.exportOptions).toMatchObject({
      displayWidth: 620,
      displayHeight: 440,
      exportScale: 3,
      visibleRange: 'current',
      chartTitle: 'GOOGL - Daily',
    })
  })

  it('preserves saved visual options while restoring canonical render dimensions', () => {
    const chartExportSpec = {
      symbol: 'GOOGL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      width: 2400,
      height: 1800,
      companyName: 'Custom Title',
      viewportTimeRange: {
        startTime: 1_775_520_000_000,
        endTime: 1_779_206_400_000,
        visibleBars: 42,
      },
      dataTimeRange: {
        startTime: 1_735_603_200_000,
        endTime: 1_779_206_400_000,
      },
      exportOptions: {
        displayWidth: 1200,
        displayHeight: 900,
        exportScale: 2,
        visibleRange: 'custom',
        chartTitle: 'Custom Title',
        titleSize: 42,
        axisLabelSize: 13,
        showTitle: true,
      },
      themeOverrides: {
        fontSizeHeader: 42,
        fontSizeTick: 13,
        fontSizeTimeAxis: 13,
      },
    }

    const resolved = resolveNewsletterPriceExportEditor({
      mode: 'price',
      symbol: 'GOOGL',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
      chartExportSpec,
    })

    expect(resolved.baseSpec.width).toBe(1860)
    expect(resolved.baseSpec.height).toBe(1320)
    expect(resolved.baseSpec.companyName).toBe('Custom Title')
    expect(resolved.baseSpec.exportOptions).toMatchObject({
      displayWidth: 620,
      displayHeight: 440,
      exportScale: 3,
      visibleRange: 'custom',
      chartTitle: 'Custom Title',
      titleSize: 42,
      axisLabelSize: 13,
    })
    expect(resolved.baseSpec.themeOverrides).toMatchObject({
      fontSizeHeader: 42,
      fontSizeTick: 13,
      fontSizeTimeAxis: 13,
    })
  })

  it('requests a newsletter-sized fundamentals editor surface too', () => {
    const spec: FundamentalsNewsletterChartSpec = {
      mode: 'fundamentals',
      stocks: ['NVDA'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      chartType: 'bar',
      showLabels: true,
      stacked: false,
      indexToZero: false,
      title: 'NVDA Revenue vs Net Income',
    }

    const resolved = resolveNewsletterChartEditor(spec, { theme: 'light' })
    const iframeUrl = new URL(
      resolved.iframePath,
      'https://charting-proxy.theintraday.invalid',
    )

    expect(iframeUrl.pathname).toBe('/tos/NVDA')
    expect(iframeUrl.searchParams.get('embed')).toBe('true')
    expect(iframeUrl.searchParams.get('newsletterEditor')).toBe('1')
    expect(iframeUrl.searchParams.get('newsletterEditorTarget')).toBe('fundamentals')
    expect(iframeUrl.searchParams.get('newsletterEditorWidth')).toBe('620')
    expect(iframeUrl.searchParams.get('newsletterEditorHeight')).toBe('440')
  })

  it('persists normalized price workspace state when saving from the editor', () => {
    const fallback: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'TXN',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
    }

    const parsed = parsePriceNewsletterChartSpecFromState(
      {
        symbol: 'txn',
        range: '1m',
        interval: 'D',
        chartType: 'line',
        indicators: [{ kind: 'macd', panel: 'lower-1' }],
        priceScale: { min: 245.4, max: 366.2 },
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
              { barIndex: 210, price: 250.1 },
              { barIndex: 238, price: 236.4 },
            ],
            style: { color: '#111827', width: 3 },
          },
        ],
        volumeVisible: false,
        viewport: { startIndex: 210, visibleBars: 72 },
      },
      'TXN',
      fallback,
    )

    expect(parsed).toMatchObject({
      mode: 'price',
      symbol: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'line',
    })
    expect(parsed?.priceState).toMatchObject({
      symbol: 'TXN',
      ticker: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'line',
      priceScale: { min: 245.4, max: 366.2 },
      sessionVisibility: 'regularOnly',
      themeColors: {
        sessionPreBg: 'rgba(255, 255, 255, 0.031)',
        sessionPostBg: 'rgba(255, 255, 255, 0.031)',
      },
      volumeVisible: false,
      viewport: { startIndex: 210, visibleBars: 72 },
      drawings: [
        {
          id: 'draw-1',
          type: 'arrow',
          anchors: [
            { barIndex: 210, price: 250.1 },
            { barIndex: 238, price: 236.4 },
          ],
          style: { color: '#111827', width: 3 },
        },
      ],
      indicators: [{ kind: 'macd', panel: 'lower-1' }],
    })
  })
})
