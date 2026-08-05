import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FinancialStatementsTabs from '@/components/FinancialStatementsTabs'

describe('FinancialStatementsTabs', () => {
  it('renders reported zeroes instead of calling them unavailable', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[{
          year: 2026,
          revenue: 0,
          costOfRevenue: 0,
          grossProfit: 0,
          grossMargin: 0,
          operatingExpenses: 0,
          operatingIncome: 0,
          operatingMargin: 0,
          netIncome: 0,
          netMargin: 0,
          eps: 0,
          ebitda: 0,
          stockBasedCompensation: 0,
          peRatio: 0,
          priceToSalesRatio: 0,
          sharesOutstanding: 0,
          marketCap: 0,
        }]}
        balanceSheet={[]}
        cashFlow={[]}
      />,
    )

    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0.00%').length).toBeGreaterThan(0)
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })
})
