import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import FinancialStatementsTabs from '@/components/FinancialStatementsTabs'

type FinancialStatementsProps = ComponentProps<typeof FinancialStatementsTabs>

const zeroIncomeStatement: FinancialStatementsProps['incomeStatement'][number] = {
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
}

const statementForYear = <T extends { year: number }>(year: number) => ({ year }) as T

describe('FinancialStatementsTabs', () => {
  it('renders reported zeroes instead of calling them unavailable', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[zeroIncomeStatement]}
        balanceSheet={[]}
        cashFlow={[]}
      />,
    )

    const activePanel = screen.getByRole('tabpanel', { name: 'Income Statement' })
    expect(within(activePanel).getAllByText('$0.00').length).toBeGreaterThan(0)
    expect(within(activePanel).getAllByText('0.00%').length).toBeGreaterThan(0)
    expect(within(activePanel).queryByText('N/A')).not.toBeInTheDocument()
  })

  it('exposes tabs, selected state, linked panels, and keyboard navigation', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[zeroIncomeStatement]}
        balanceSheet={[]}
        cashFlow={[]}
      />,
    )

    expect(screen.getByRole('tablist', { name: 'Financial statements' })).toBeInTheDocument()

    const incomeTab = screen.getByRole('tab', { name: 'Income Statement' })
    const balanceTab = screen.getByRole('tab', { name: 'Balance Sheet' })
    const panels = screen.getAllByRole('tabpanel', { hidden: true })

    expect(panels).toHaveLength(3)
    expect(incomeTab).toHaveAttribute('aria-selected', 'true')
    expect(incomeTab).toHaveAttribute('tabindex', '0')
    expect(incomeTab).toHaveAttribute('aria-controls', panels[0].id)
    expect(panels[0]).toHaveAttribute('aria-labelledby', incomeTab.id)
    expect(balanceTab).toHaveAttribute('aria-selected', 'false')
    expect(balanceTab).toHaveAttribute('tabindex', '-1')

    incomeTab.focus()
    fireEvent.keyDown(incomeTab, { key: 'ArrowRight' })

    expect(balanceTab).toHaveFocus()
    expect(balanceTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Balance Sheet' })).toBeVisible()
  })

  it('builds the fiscal-year axis from every statement source and sorts it', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[zeroIncomeStatement]}
        balanceSheet={[
          statementForYear<FinancialStatementsProps['balanceSheet'][number]>(2025),
        ]}
        cashFlow={[
          statementForYear<FinancialStatementsProps['cashFlow'][number]>(2024),
        ]}
      />,
    )

    const table = screen.getByRole('table', {
      name: 'Income Statement by fiscal year, newest to oldest',
    })
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Metric',
      'FY 2026',
      'FY 2025',
      'FY 2024',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Show oldest fiscal year first' }))

    const sortedTable = screen.getByRole('table', {
      name: 'Income Statement by fiscal year, oldest to newest',
    })
    expect(within(sortedTable).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Metric',
      'FY 2024',
      'FY 2025',
      'FY 2026',
    ])
  })

  it('still renders when only a non-income statement has data', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[]}
        balanceSheet={[
          {
            year: 2025,
            totalAssets: 123_000_000,
          } as FinancialStatementsProps['balanceSheet'][number],
        ]}
        cashFlow={[]}
      />,
    )

    expect(screen.getByRole('tablist', { name: 'Financial statements' })).toBeInTheDocument()
    const balanceTab = screen.getByRole('tab', { name: 'Balance Sheet' })
    const balancePanel = screen.getByRole('tabpanel', { name: 'Balance Sheet' })
    expect(balanceTab).toHaveAttribute('aria-selected', 'true')
    expect(within(balancePanel).getByRole('columnheader', { name: 'FY 2025' })).toBeInTheDocument()
    expect(within(balancePanel).getByText('$123.00M')).toBeInTheDocument()
  })

  it('moves to an available statement when refreshed props empty the active source', () => {
    const { rerender } = render(
      <FinancialStatementsTabs
        incomeStatement={[zeroIncomeStatement]}
        balanceSheet={[]}
        cashFlow={[]}
      />,
    )

    rerender(
      <FinancialStatementsTabs
        incomeStatement={[]}
        balanceSheet={[{
          year: 2025,
          totalAssets: 50_000_000,
        } as FinancialStatementsProps['balanceSheet'][number]]}
        cashFlow={[]}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Balance Sheet' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tabpanel', { name: 'Balance Sheet' })).toBeVisible()
  })

  it('labels the table and uses metric cells as row headers', () => {
    render(
      <FinancialStatementsTabs
        incomeStatement={[zeroIncomeStatement]}
        balanceSheet={[]}
        cashFlow={[]}
      />,
    )

    const table = screen.getByRole('table', {
      name: 'Income Statement by fiscal year, newest to oldest',
    })
    const revenueHeader = within(table).getByRole('rowheader', { name: 'Revenue' })

    expect(revenueHeader.tagName).toBe('TH')
    expect(revenueHeader).toHaveAttribute('scope', 'row')
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toHaveAttribute('scope', 'col')
  })
})
