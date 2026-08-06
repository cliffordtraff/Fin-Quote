import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InsiderTrade } from '@/app/actions/insider-trading'

const actionMocks = vi.hoisted(() => ({
  getInsiderTradesBySymbol: vi.fn(),
  getLatestInsiderTrades: vi.fn(),
  getTopInsiderTrades: vi.fn(),
  searchInsiderTradesByName: vi.fn(),
}))

vi.mock('@/app/actions/insider-trading', () => actionMocks)

import InsidersPageClient from '@/components/InsidersPageClient'

const trade: InsiderTrade = {
  symbol: 'AAPL',
  filingDate: '2026-08-05',
  transactionDate: '2026-08-04',
  reportingName: 'Example Executive',
  typeOfOwner: 'Chief Financial Officer',
  transactionType: 'S',
  securitiesTransacted: 5_000,
  price: 210,
  securitiesOwned: 20_000,
  securityName: 'Common stock',
  link: '',
  acquistionOrDisposition: 'D',
  formType: '4',
  value: 1_050_000,
  insiderId: 'example-executive',
}

describe('InsidersPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actionMocks.getInsiderTradesBySymbol.mockResolvedValue({ trades: [] })
    actionMocks.getLatestInsiderTrades.mockResolvedValue({ trades: [trade] })
    actionMocks.getTopInsiderTrades.mockResolvedValue({ trades: [trade] })
    actionMocks.searchInsiderTradesByName.mockResolvedValue({ trades: [] })
  })

  it('exposes responsive, keyboard-operable tabs and a live results announcement', async () => {
    render(<InsidersPageClient initialTrades={[trade]} />)

    expect(screen.getByRole('tablist', { name: 'Insider trading views' })).toHaveClass('grid-cols-2')
    const latestTab = screen.getByRole('tab', { name: 'Latest Trades' })
    expect(latestTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 1 trades')

    fireEvent.keyDown(latestTab, { key: 'ArrowRight' })

    const topTab = screen.getByRole('tab', { name: 'Top Trades (Week)' })
    expect(topTab).toHaveFocus()
    expect(topTab).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false')
    })
  })

  it('announces a rejected request and always leaves the loading state', async () => {
    let rejectRequest: (reason?: unknown) => void = () => undefined
    actionMocks.getTopInsiderTrades.mockReturnValueOnce(new Promise((_, reject) => {
      rejectRequest = reject
    }))

    render(<InsidersPageClient initialTrades={[trade]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Top Trades (Week)' }))

    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading insider trades…')

    await act(async () => {
      rejectRequest(new Error('network unavailable'))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the top insider trades')
    })
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('status')).toHaveTextContent('The results could not be updated.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('sorts the full filtered result set before paginating', () => {
    const manyTrades = Array.from({ length: 51 }, (_, index): InsiderTrade => ({
      ...trade,
      symbol: index === 50 ? 'TOP' : `T${String(index).padStart(2, '0')}`,
      reportingName: `Executive ${index}`,
      securitiesTransacted: index === 50 ? 1_000_000 : index + 1,
      price: 1,
      insiderId: `executive-${index}`,
    }))

    render(<InsidersPageClient initialTrades={manyTrades} />)

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'TOP' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Value' }))

    expect(screen.getByRole('link', { name: 'TOP' })).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })
})
