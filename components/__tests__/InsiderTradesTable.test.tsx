import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import InsiderTradesTable from '@/components/InsiderTradesTable'
import type { InsiderTrade } from '@/app/actions/insider-trading'

const originalTimeZone = process.env.TZ

const trades: InsiderTrade[] = [{
  symbol: 'FINS',
  filingDate: '2026-07-10',
  transactionDate: '2026-07-10',
  reportingName: 'MetLife Investment Management, LLC',
  typeOfOwner: '10% Owner',
  transactionType: 'P',
  securitiesTransacted: 40_000_000,
  price: 1,
  securitiesOwned: 40_000_000,
  securityName: '5.364% Series C Senior Unsecured Notes due July 8, 2030',
  link: '',
  acquistionOrDisposition: 'A',
  formType: '4',
  value: 40_000_000,
  insiderId: null,
}]

afterEach(() => {
  process.env.TZ = originalTimeZone
})

describe('InsiderTradesTable', () => {
  it('renders date-only transaction dates identically across server time zones', () => {
    process.env.TZ = 'UTC'
    const utcMarkup = renderToStaticMarkup(<InsiderTradesTable trades={trades} />)

    process.env.TZ = 'America/New_York'
    const easternMarkup = renderToStaticMarkup(<InsiderTradesTable trades={trades} />)

    expect(easternMarkup).toBe(utcMarkup)
    expect(easternMarkup).toContain('Jul 10, 26')
    expect(easternMarkup).toContain('$40.0M')
  })

  it('uses table semantics, full transaction names, and accessible sorting controls', () => {
    render(<InsiderTradesTable trades={trades} />)

    expect(screen.getByRole('table', { name: /Insider transactions/i })).toBeInTheDocument()
    expect(screen.getByText('Purchase')).toBeInTheDocument()

    const valueSort = screen.getByRole('button', { name: 'Sort by Value' })
    fireEvent.click(valueSort)

    expect(valueSort.closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('combobox', { name: 'Sort insider trades by' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change sort direction to ascending' })).toBeInTheDocument()
  })
})
