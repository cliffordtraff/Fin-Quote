import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ForexBondsTable from '@/components/ForexBondsTable'
import type { ForexBondData } from '@/app/actions/forex-bonds'

describe('ForexBondsTable', () => {
  it('renders the four-column dashboard table with market-specific formatting', () => {
    const data: ForexBondData[] = [
      {
        symbol: 'EURUSD',
        name: 'EUR/USD',
        price: 1.1513,
        change: -0.0013,
        changesPercentage: -0.11,
      },
      {
        symbol: 'USDJPY',
        name: 'USD/JPY',
        price: 160.24,
        change: 0.46,
        changesPercentage: 0.29,
      },
      {
        symbol: '^FVX',
        name: '5-Year Treasury',
        price: 4.07,
        change: -0.025,
        changesPercentage: -0.61,
      },
      {
        symbol: '^TNX',
        name: '10-Year Treasury',
        price: 4.44,
        change: 0.024,
        changesPercentage: 0.54,
      },
    ]

    render(<ForexBondsTable data={data} />)

    expect(screen.getByText('Forex & Bonds')).toBeInTheDocument()
    expect(screen.getByText('Last')).toBeInTheDocument()
    expect(screen.getByText('Change')).toBeInTheDocument()
    expect(screen.getByText('Change %')).toBeInTheDocument()
    expect(screen.queryByText('YTD')).not.toBeInTheDocument()

    expect(screen.getByText('1.1513')).toBeInTheDocument()
    expect(screen.getByText('160.24')).toBeInTheDocument()
    expect(screen.getByText('4.07')).toBeInTheDocument()
    expect(screen.getByText('+0.46')).toBeInTheDocument()
    expect(screen.getByText('+0.024')).toBeInTheDocument()
  })
})
