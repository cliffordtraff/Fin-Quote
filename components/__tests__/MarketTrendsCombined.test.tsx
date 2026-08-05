import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AllSessionMoversResult, MoverData } from '@/app/actions/market-movers'
import type { DashboardChartOfTheDayPresentation } from '@/lib/dashboard/chart-of-the-day-presentation'

vi.mock('@/lib/timezone-context', () => ({
  useTimezone: () => ({ timezone: 'America/New_York' }),
}))

vi.mock('@/components/DashboardChartOfTheDay', () => ({
  default: () => <div>Native chart</div>,
}))

vi.mock('@/components/TickerLink', () => ({
  default: ({ symbol }: { symbol: string }) => <a href={`/stock/${symbol}`}>{symbol}</a>,
}))

import MarketTrendsCombined from '@/components/MarketTrendsCombined'

function movers(prefix: string, count = 10): MoverData[] {
  return Array.from({ length: count }, (_, index) => ({
    symbol: `${prefix}${String(index + 1).padStart(2, '0')}`,
    name: `${prefix} company ${index + 1}`,
    price: index + 1,
    change: index + 0.5,
    changesPercentage: prefix === 'G' ? index + 10 : -(index + 10),
  }))
}

function sessions(rows: MoverData[]): AllSessionMoversResult {
  return {
    premarket: [],
    cash: rows,
    afterhours: [],
    currentSession: 'cash',
  }
}

const presentation: DashboardChartOfTheDayPresentation = {
  symbol: 'TSLA',
  title: 'TSLA Revenue',
  subtitle: null,
  periodType: 'annual',
  periodLabel: 'Annual · 2022–2025',
  minYear: 2022,
  maxYear: 2025,
  indexed: false,
  series: [],
}

describe('MarketTrendsCombined', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows eight movers per side until View all is selected', () => {
    render(
      <MarketTrendsCombined
        gainers={sessions(movers('G'))}
        losers={sessions(movers('L'))}
        chartOfDayPresentation={presentation}
      />,
    )

    expect(screen.getByText('G08')).toBeInTheDocument()
    expect(screen.queryByText('G09')).not.toBeInTheDocument()
    expect(screen.getAllByText('8 / 10')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'View all 10' }))

    expect(screen.getByText('G09')).toBeInTheDocument()
    expect(screen.getByText('L10')).toBeInTheDocument()
    expect(screen.getAllByText('10 / 10')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Show top 8' })).toBeInTheDocument()
  })

  it('loads and expands a catalyst for only the requested ticker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reasons: {
          G01: {
            symbol: 'G01',
            status: 'found',
            reason: 'Shares rose after a stronger-than-expected update.',
            sourceUrl: 'https://example.com/story',
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MarketTrendsCombined
        gainers={sessions(movers('G'))}
        losers={sessions(movers('L'))}
        chartOfDayPresentation={presentation}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Why is G01 moving?' }))

    await waitFor(() => {
      expect(screen.getByText('Shares rose after a stronger-than-expected update.')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stock-why-moving/batch',
      expect.objectContaining({ body: JSON.stringify({ symbols: ['G01'] }) }),
    )
    expect(screen.getByRole('link', { name: 'Source ↗' })).toHaveAttribute(
      'href',
      'https://example.com/story',
    )
  })

  it('does not render a mover source link for a non-http URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reasons: {
          G01: {
            symbol: 'G01',
            status: 'found',
            reason: 'Shares rose after a company update.',
            sourceUrl: 'javascript:alert(1)',
          },
        },
      }),
    }))

    render(
      <MarketTrendsCombined
        gainers={sessions(movers('G'))}
        losers={sessions(movers('L'))}
        chartOfDayPresentation={presentation}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Why is G01 moving?' }))

    await waitFor(() => {
      expect(screen.getByText('Shares rose after a company update.')).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Source ↗' })).not.toBeInTheDocument()
  })
})
