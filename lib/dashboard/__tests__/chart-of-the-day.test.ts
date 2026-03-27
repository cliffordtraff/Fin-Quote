import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_CHART_OF_THE_DAY_RENDER_HEIGHT,
  DASHBOARD_CHART_OF_THE_DAY_RENDER_WIDTH,
  DASHBOARD_CHART_OF_THE_DAY_SYMBOL,
  DASHBOARD_CHART_OF_THE_DAY_TEMPLATE_ID,
  resolveDashboardChartOfTheDay,
} from '@/lib/dashboard/chart-of-the-day'
import { decodeChartSpec } from '@/lib/chart-export'
import { isPriceNewsletterChartSpec } from '@/lib/newsletter/chart-spec'

describe('resolveDashboardChartOfTheDay', () => {
  it('uses the newsletter editorial template and local export pipeline', () => {
    const result = resolveDashboardChartOfTheDay({
      baseUrl: 'https://theintraday.com',
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

    const exportUrl = new URL(result.exportUrl)
    expect(exportUrl.pathname).toBe('/charts/export')

    const decodedSpec = decodeChartSpec(exportUrl.searchParams.get('spec') || '')
    expect(decodedSpec).toMatchObject({
      stocks: [DASHBOARD_CHART_OF_THE_DAY_SYMBOL],
      metrics: ['revenue', 'net_income'],
      title: 'AAPL Revenue vs Net Income',
    })
  })
})
