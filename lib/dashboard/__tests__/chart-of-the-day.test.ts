import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  resolveDashboardChartOfTheDay,
} from '@/lib/dashboard/chart-of-the-day'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'

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
    expect(result.spec.title).not.toMatch(/\(\s*(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\s*\)$/u)

    expect(DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH).toBe(1200)
    expect(DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT).toBe(760)

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
  })
})
