import { describe, expect, it } from 'vitest'

import {
  parseFundamentalsNewsletterChartSpecFromFundState,
  parsePriceNewsletterChartSpecFromState,
  resolveNewsletterPriceChartEditor,
} from '@/lib/newsletter/chart-editor'
import type {
  FundamentalsNewsletterChartSpec,
  PriceNewsletterChartSpec,
} from '@/lib/newsletter/types'

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

  it('restores saved price workspace state into the embedded editor iframe', () => {
    const spec: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: 'TXN',
      range: '1m',
      interval: 'D',
      chartType: 'candles',
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
    expect(decodedState.symbol).toBe('TXN')
    expect(decodedState.ticker).toBe('TXN')
    expect(decodedState.range).toBe('1m')
    expect(decodedState.interval).toBe('D')
    expect(decodedState.chartType).toBe('candles')
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
