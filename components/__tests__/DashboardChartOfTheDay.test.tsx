import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DashboardChartOfTheDay from '@/components/DashboardChartOfTheDay'
import type { DashboardChartOfTheDayPresentation } from '@/lib/dashboard/chart-of-the-day-presentation'

const presentation: DashboardChartOfTheDayPresentation = {
  symbol: 'TSLA',
  title: 'TSLA Revenue and Earnings',
  subtitle: null,
  periodType: 'annual',
  periodLabel: 'Annual · 2022–2025',
  minYear: 2022,
  maxYear: 2025,
  indexed: false,
  series: [
    {
      id: 'revenue',
      label: 'Revenue',
      unit: 'currency',
      kind: 'bar',
      points: [
        { key: '2022', label: '2022', value: 81_500_000_000, year: 2022, fiscalQuarter: null },
        { key: '2023', label: '2023', value: 96_800_000_000, year: 2023, fiscalQuarter: null },
        { key: '2024', label: '2024', value: 97_700_000_000, year: 2024, fiscalQuarter: null },
        { key: '2025', label: '2025', value: 94_800_000_000, year: 2025, fiscalQuarter: null },
      ],
    },
    {
      id: 'stock_price',
      label: 'Stock Price',
      unit: 'price',
      kind: 'line',
      points: [
        { key: '2022', label: '2022', value: 123, year: 2022, fiscalQuarter: null },
        { key: '2023', label: '2023', value: 248, year: 2023, fiscalQuarter: null },
        { key: '2024', label: '2024', value: 404, year: 2024, fiscalQuarter: null },
        { key: '2025', label: '2025', value: 449, year: 2025, fiscalQuarter: null },
      ],
    },
  ],
}

describe('DashboardChartOfTheDay', () => {
  it('renders a native accessible chart without an iframe', () => {
    const { container } = render(
      <DashboardChartOfTheDay presentation={presentation} />,
    )

    expect(screen.getByRole('heading', {
      name: 'TSLA Revenue and Earnings · Annual · 2022–2025',
    })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'TSLA Revenue and Earnings. Annual · 2022–2025.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open chart' })).toHaveAttribute(
      'href',
      '/workspace/fundamentals?symbol=TSLA',
    )
    expect(screen.getByText('$94.8B')).toBeInTheDocument()
    expect(screen.getByText('$449')).toBeInTheDocument()
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('links to fundamentals when presentation data is unavailable', () => {
    render(
      <DashboardChartOfTheDay
        presentation={{ ...presentation, series: [] }}
      />,
    )

    expect(screen.getByText('Chart data is temporarily unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open fundamentals' })).toHaveAttribute(
      'href',
      '/workspace/fundamentals?symbol=TSLA',
    )
  })
})
