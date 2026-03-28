import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TopInsiderTrades from '@/components/TopInsiderTrades'
import type { LargeInsiderTrade } from '@/lib/insider-large-trades'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('TopInsiderTrades', () => {
  it('shows the top four sale/proposed-sale rows plus the top three buys and keeps text to one line', () => {
    const trades: LargeInsiderTrade[] = [
      {
        symbol: 'WMT',
        reportingName: 'Walton Family Holdings Trust',
        transactionDate: '2026-03-25',
        transactionCode: 'S',
        formType: '4',
        shares: 1,
        price: 366404040,
        value: 366404040,
        acquisitionDisposition: 'D',
      },
      {
        symbol: 'NVDA',
        reportingName: 'MARK A STEVENS',
        transactionDate: '2026-03-20',
        transactionCode: 'S',
        formType: '144',
        shares: 1,
        price: 303552000,
        value: 303552000,
        acquisitionDisposition: 'D',
      },
      {
        symbol: 'AVGO',
        reportingName: 'H&S INVESTMENTS I LP',
        transactionDate: '2026-03-25',
        transactionCode: 'S',
        formType: '144',
        shares: 1,
        price: 170000150,
        value: 170000150,
        acquisitionDisposition: 'D',
      },
      {
        symbol: 'FLOC',
        reportingName: 'Fairbanks Jonathan B.',
        transactionDate: '2026-03-23',
        transactionCode: 'S',
        formType: '4',
        shares: 1,
        price: 165165000,
        value: 165165000,
        acquisitionDisposition: 'D',
      },
      {
        symbol: 'MBAV',
        reportingName: 'CANTOR FITZGERALD, L. P.',
        transactionDate: '2026-03-24',
        transactionCode: 'S',
        formType: '4',
        shares: 1,
        price: 84022542,
        value: 84022542,
        acquisitionDisposition: 'D',
      },
      {
        symbol: 'BUY',
        reportingName: 'Buy Side Example',
        transactionDate: '2026-03-24',
        transactionCode: 'P',
        formType: '4',
        shares: 1,
        price: 99999999,
        value: 99999999,
        acquisitionDisposition: 'A',
      },
      {
        symbol: 'ACQ',
        reportingName: 'Acquisition Alpha',
        transactionDate: '2026-03-22',
        transactionCode: 'P',
        formType: '4',
        shares: 1,
        price: 88888888,
        value: 88888888,
        acquisitionDisposition: 'A',
      },
      {
        symbol: 'BULL',
        reportingName: 'Bullish Buyer',
        transactionDate: '2026-03-21',
        transactionCode: 'P',
        formType: '4',
        shares: 1,
        price: 77777777,
        value: 77777777,
        acquisitionDisposition: 'A',
      },
      {
        symbol: 'SMOL',
        reportingName: 'Small Buyer',
        transactionDate: '2026-03-20',
        transactionCode: 'P',
        formType: '4',
        shares: 1,
        price: 66666666,
        value: 66666666,
        acquisitionDisposition: 'A',
      },
    ]

    render(<TopInsiderTrades trades={trades} />)

    expect(screen.getByText('WMT')).toBeInTheDocument()
    expect(screen.getByText('NVDA')).toBeInTheDocument()
    expect(screen.getByText('AVGO')).toBeInTheDocument()
    expect(screen.getByText('FLOC')).toBeInTheDocument()
    expect(screen.getByText('BUY')).toBeInTheDocument()
    expect(screen.getByText('ACQ')).toBeInTheDocument()
    expect(screen.getByText('BULL')).toBeInTheDocument()
    expect(screen.queryByText('MBAV')).not.toBeInTheDocument()
    expect(screen.queryByText('SMOL')).not.toBeInTheDocument()

    const insiderName = screen.getByText('Walton Family Holdings Trust')
    expect(insiderName).toHaveClass('truncate')
    expect(insiderName).toHaveClass('whitespace-nowrap')

    expect(screen.getAllByText('Buy')).toHaveLength(3)
  })
})
