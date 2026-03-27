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
  it('uses the newsletter editorial template and charting export pipeline', () => {
    const result = resolveDashboardChartOfTheDay({
      chartBaseUrl: 'https://charts.theintraday.com',
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

    expect(result.captureSpec).toMatchObject({
      theme: 'dark',
      width: DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
      height: DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
    })

    expect(result.fundState).toMatchObject({
      visibleMetrics: ['revenue', 'netIncome'],
      chartTitleCustomized: true,
      chartTitleText: 'AAPL Revenue vs Net Income',
    })

    const interactiveUrl = new URL(result.interactiveUrl)
    expect(interactiveUrl.pathname).toBe('/tos/AAPL')
    expect(interactiveUrl.searchParams.get('view')).toBe('fundamentals')
    expect(interactiveUrl.searchParams.get('theme')).toBe('dark')
  })
})
