import { describe, expect, it } from 'vitest'
import type { MetricData } from '@/app/actions/chart-metrics'
import { buildDashboardChartOfTheDayPresentation } from '@/lib/dashboard/chart-of-the-day-presentation'
import type { FundamentalsNewsletterChartSpec } from '@/lib/newsletter/types'

function annualSeries(
  metric: MetricData['metric'],
  label: string,
  unit: MetricData['unit'],
  multiplier = 1,
): MetricData {
  return {
    metric,
    label,
    unit,
    data: Array.from({ length: 14 }, (_, index) => ({
      year: 2012 + index,
      value: (index + 1) * multiplier,
      date: `${2012 + index}-12-31`,
    })),
  }
}

describe('buildDashboardChartOfTheDayPresentation', () => {
  it('creates a compact three-series dashboard presentation', () => {
    const spec: FundamentalsNewsletterChartSpec = {
      stocks: ['tsla'],
      metrics: ['revenue', 'net_income'],
      periodType: 'annual',
      chartType: 'bar',
      showStockPrice: true,
      title: 'TSLA Revenue and Earnings',
    }
    const presentation = buildDashboardChartOfTheDayPresentation(
      spec,
      [
        annualSeries('revenue', 'Revenue', 'currency', 100_000_000_000),
        annualSeries('net_income', 'Net Income', 'currency', 10_000_000_000),
      ],
      annualSeries('stock_price', 'Stock Price', 'price', 25),
    )

    expect(presentation).toMatchObject({
      symbol: 'TSLA',
      title: 'TSLA Revenue and Earnings',
      periodType: 'annual',
      periodLabel: 'Annual · 2014–2025',
      minYear: 2014,
      maxYear: 2025,
      indexed: false,
    })
    expect(presentation.series).toHaveLength(3)
    expect(presentation.series.map((series) => series.id)).toEqual([
      'revenue',
      'net_income',
      'stock_price',
    ])
    expect(presentation.series[0].points).toHaveLength(12)
    expect(presentation.series[2]).toMatchObject({
      label: 'Stock Price',
      unit: 'price',
      kind: 'line',
    })
  })

  it('indexes every series to its first non-zero observation', () => {
    const spec: FundamentalsNewsletterChartSpec = {
      stocks: ['AAPL'],
      metrics: ['revenue'],
      periodType: 'annual',
      chartType: 'bar',
      indexToZero: true,
    }
    const presentation = buildDashboardChartOfTheDayPresentation(
      spec,
      [{
        metric: 'revenue',
        label: 'Revenue',
        unit: 'currency',
        data: [
          { year: 2023, value: 100 },
          { year: 2024, value: 125 },
        ],
      }],
    )

    expect(presentation.indexed).toBe(true)
    expect(presentation.series[0]).toMatchObject({
      unit: 'percent',
      kind: 'line',
    })
    expect(presentation.series[0].points.map((point) => point.value)).toEqual([0, 25])
  })

  it('returns an informative empty presentation when data is unavailable', () => {
    const spec: FundamentalsNewsletterChartSpec = {
      stocks: ['MSFT'],
      metrics: ['revenue'],
      periodType: 'quarterly',
    }
    const presentation = buildDashboardChartOfTheDayPresentation(spec)

    expect(presentation).toMatchObject({
      symbol: 'MSFT',
      title: 'MSFT fundamentals',
      periodLabel: 'Quarterly',
      minYear: null,
      maxYear: null,
      series: [],
    })
  })

  it('supports a price-only saved chart', () => {
    const spec: FundamentalsNewsletterChartSpec = {
      stocks: ['NVDA'],
      metrics: ['stock_price'],
      periodType: 'annual',
      chartType: 'line',
    }
    const presentation = buildDashboardChartOfTheDayPresentation(
      spec,
      [],
      annualSeries('stock_price', 'Stock Price', 'price', 20),
    )

    expect(presentation.series).toHaveLength(1)
    expect(presentation.series[0]).toMatchObject({
      id: 'stock_price',
      label: 'Stock Price',
      unit: 'price',
      kind: 'line',
    })
  })
})
