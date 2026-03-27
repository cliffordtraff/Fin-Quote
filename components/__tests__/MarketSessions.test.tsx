import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarketSessions from '@/components/MarketSessions'
import type { GlobalIndexQuote } from '@/app/actions/global-indices'

describe('MarketSessions', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the latest percent change for closed markets in the timeline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T08:00:00Z')) // 5:00pm in Tokyo, after cash close

    const indexQuotes: GlobalIndexQuote[] = [
      {
        market: 'Tokyo',
        symbol: '^N225',
        name: 'Nikkei 225',
        price: 37250.12,
        change: 451.28,
        changesPercentage: 1.23,
      },
    ]

    render(<MarketSessions indexQuotes={indexQuotes} hideTable />)

    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('+1.23%')).toBeInTheDocument()
  })
})
