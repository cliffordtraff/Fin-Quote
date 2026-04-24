import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  parseDashboardChartOfTheDayEditorSpecFromUrl,
  resolveDashboardChartOfTheDayEditorPath,
  resolveDashboardChartOfTheDay,
  resolveDashboardChartOfTheDayEmbedSpec,
  resolveDashboardChartOfTheDayIframeUrls,
} from '@/lib/dashboard/chart-of-the-day'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'
import type { ChartExportSpec } from '@/types/chart-export'

function decodeBase64UrlJson<T>(value: string): T {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as T
}

describe('resolveDashboardChartOfTheDay', () => {
  it('uses the newsletter editorial template and charting platform render pipeline', () => {
    const result = resolveDashboardChartOfTheDay({
      hostHeader: 'localhost:3000',
      theme: 'dark',
    })

    expect(result.label).toBe('Chart of the Day')
    expect(result.symbol).toBe(DASHBOARD_CHART_OF_THE_DAY_SYMBOL)
    expect(result.templateId).toBe(DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID)
    expect(isPriceNewsletterChartSpec(result.spec)).toBe(false)

    if (isPriceNewsletterChartSpec(result.spec)) {
      throw new Error('Expected fundamentals chart spec for dashboard chart of the day')
    }

    expect(result.spec.stocks).toEqual([DASHBOARD_CHART_OF_THE_DAY_SYMBOL])
    expect(result.spec.metrics).toEqual(['revenue', 'net_income'])
    expect(result.spec.title).toBe('AAPL Revenue vs Net Income')
    expect(result.spec.colors).toMatchObject({
      revenue: '#7a9460',
    })
    expect(result.spec.title).not.toMatch(/\(\s*(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\s*\)$/u)

    expect(DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH).toBe(1600)
    expect(DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT).toBe(1014)

    expect(result.chartBaseUrl).toBe('http://localhost:3001')
    expect(result.renderUrl).toBe('http://localhost:3001/tos/api/newsletter/render')

    const captureUrl = new URL(result.captureUrl)
    expect(captureUrl.pathname).toBe('/tos/export/newsletter')

    expect(result.captureSpec).toMatchObject({
      mode: 'fundamentals',
      ticker: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
      symbol: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
      theme: 'dark',
      width: DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
      height: DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
      fundSymbol: DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
    })

    const fundState = (result.captureSpec.fundState ?? {}) as Record<string, unknown>
    expect(fundState.visibleMetrics).toEqual(['revenue', 'netIncome'])
    expect(fundState.chartTitleText).toBe('AAPL Revenue vs Net Income')
    expect(fundState.sliderOnlyMode).toBe(true)

    const interactiveUrl = new URL(result.interactiveUrl)
    const interactiveFundState = decodeBase64UrlJson<Record<string, unknown>>(
      interactiveUrl.searchParams.get('fundState') || '',
    )
    expect(interactiveUrl.searchParams.get('view')).toBe('fundamentals')
    expect(interactiveUrl.searchParams.get('theme')).toBe('dark')
    expect(interactiveFundState.sliderOnlyMode).toBe(true)
  })

  it('builds embed-ready iframe urls for both themes', () => {
    const result = resolveDashboardChartOfTheDayIframeUrls({
      hostHeader: 'localhost:3000',
    })

    const lightUrl = new URL(result.light, 'https://app.theintraday.com')
    const darkUrl = new URL(result.dark, 'https://app.theintraday.com')
    const darkSpec = decodeBase64UrlJson<Record<string, unknown>>(
      darkUrl.searchParams.get('spec') || '',
    )

    expect(result.light.startsWith('/tos/dashboard/fundamentals?spec=')).toBe(true)
    expect(lightUrl.pathname).toBe('/tos/dashboard/fundamentals')

    expect(darkUrl.pathname).toBe('/tos/dashboard/fundamentals')
    expect(darkSpec.theme).toBe('dark')
    expect(darkSpec.width).toBe(DASHBOARD_CHART_OF_THE_DAY_IFRAME_WIDTH)
    expect(darkSpec.height).toBe(DASHBOARD_CHART_OF_THE_DAY_IFRAME_HEIGHT)

    const darkFundState = (darkSpec.fundState ?? {}) as Record<string, unknown>
    expect(darkFundState.sliderOnlyMode).toBe(true)
    expect(darkFundState.showTooltip).toBe(false)
    expect(darkFundState.hoverFocusEnabled).toBe(false)
  })

  it('builds a fundamentals editor path with interactive editing enabled', () => {
    const spec: ChartExportSpec = {
      stocks: ['AAPL'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      chartType: 'bar',
    }

    const result = resolveDashboardChartOfTheDayEditorPath(spec, 'dark')
    const editorUrl = new URL(result, 'https://app.theintraday.com')
    const editorFundState = decodeBase64UrlJson<Record<string, unknown>>(
      editorUrl.searchParams.get('fundState') || '',
    )

    expect(editorUrl.pathname).toBe('/tos/AAPL')
    expect(editorUrl.searchParams.get('view')).toBe('fundamentals')
    expect(editorUrl.searchParams.get('theme')).toBe('dark')
    expect(editorFundState.sliderOnlyMode).toBe(false)
    expect(editorFundState.showTooltip).toBe(true)
    expect(editorFundState.hoverFocusEnabled).toBe(true)
  })

  it('can recover a dashboard chart spec from the fundamentals editor url', () => {
    const spec: ChartExportSpec = {
      stocks: ['NVDA', 'AMD', 'QCOM'],
      metrics: ['debt_to_equity_ratio', 'rd_pct_revenue'],
      periodType: 'quarterly',
      minYear: 2018,
      maxYear: 2024,
      showStockPrice: true,
      chartType: 'line',
      showLabels: false,
      stacked: false,
      indexToZero: true,
      title: 'NVDA Capital Discipline vs R&D Mix',
      subtitle: 'Quarterly comparison',
      colors: {
        debt_to_equity_ratio: '#223344',
        rd_pct_revenue: '#556677',
      },
    }

    const editorPath = resolveDashboardChartOfTheDayEditorPath(spec, 'light')
    const parsedSpec = parseDashboardChartOfTheDayEditorSpecFromUrl(editorPath, spec)

    expect(parsedSpec).toEqual(spec)
  })

  it('recovers saved per-metric fundamentals chart styles from the editor url', () => {
    const spec: ChartExportSpec = {
      stocks: ['AMZN'],
      metrics: ['gross_margin'],
      periodType: 'annual',
      chartType: 'line',
    }

    const editorUrl = new URL(
      resolveDashboardChartOfTheDayEditorPath(spec, 'light'),
      'https://app.theintraday.com',
    )
    const fundState = decodeBase64UrlJson<Record<string, unknown>>(
      editorUrl.searchParams.get('fundState') || '',
    )
    fundState.metricChartTypes = {
      grossMargin: 'bar',
    }
    editorUrl.searchParams.set(
      'fundState',
      Buffer.from(JSON.stringify(fundState), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, ''),
    )

    const parsedSpec = parseDashboardChartOfTheDayEditorSpecFromUrl(
      `${editorUrl.pathname}${editorUrl.search}`,
      spec,
    )

    expect(parsedSpec).toMatchObject({
      stocks: ['AMZN'],
      metrics: ['gross_margin'],
      chartType: 'bar',
    })
  })

  it('exposes a serializable fundamentals spec for client-sized embeds', () => {
    const spec = resolveDashboardChartOfTheDayEmbedSpec()

    expect(isPriceNewsletterChartSpec(spec)).toBe(false)

    if (isPriceNewsletterChartSpec(spec)) {
      throw new Error('Expected fundamentals chart spec for dashboard chart of the day')
    }

    expect(spec.stocks).toEqual([DASHBOARD_CHART_OF_THE_DAY_SYMBOL])
    expect(spec.metrics).toEqual(['revenue', 'net_income'])
    expect(spec.title).toBe('AAPL Revenue vs Net Income')
    expect(spec.colors).toMatchObject({
      revenue: '#7a9460',
    })
  })

  it('supports non-default admin-configured selections', () => {
    const spec = resolveDashboardChartOfTheDayEmbedSpec({
      ...DASHBOARD_CHART_OF_THE_DAY_DEFAULT_SELECTION,
      ticker: 'MSFT',
      templateId: 'gross_vs_operating_margin',
      periodType: 'quarterly',
    })

    expect(isPriceNewsletterChartSpec(spec)).toBe(false)

    if (isPriceNewsletterChartSpec(spec)) {
      throw new Error('Expected fundamentals chart spec for dashboard chart of the day')
    }

    expect(spec.stocks).toEqual(['MSFT'])
    expect(spec.periodType).toBe('quarterly')
    expect(spec.metrics).toEqual(['gross_margin', 'operating_margin'])
    expect(spec.title).toBe('MSFT Gross vs Operating Margin')
  })
})
