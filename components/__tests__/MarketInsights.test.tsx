import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarketInsights from '@/components/MarketInsights'
import type { MarketTrendsBullet } from '@/app/actions/market-trends-responses'

const bullets: MarketTrendsBullet[] = [
  { emoji: '', title: 'Leadership', description: 'Large-cap technology is leading.' },
  { emoji: '', title: 'Breadth', description: 'Small caps are lagging the broader market.' },
  { emoji: '', title: 'Volatility', description: 'The VIX is moving lower.' },
  { emoji: '', title: 'Fourth driver', description: 'This should remain out of the compact view.' },
]

describe('MarketInsights', () => {
  it('shows one takeaway, three drivers, and expandable context', () => {
    render(
      <MarketInsights
        marketTakeaway="Large caps are leading while small caps lag."
        marketSummary="The complete market narrative remains available here."
        responsesApiBullets={bullets}
      />,
    )

    expect(screen.getByRole('heading', {
      name: 'Large caps are leading while small caps lag.',
    })).toBeInTheDocument()
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Breadth')).toBeInTheDocument()
    expect(screen.getByText('Volatility')).toBeInTheDocument()
    expect(screen.queryByText('Fourth driver')).not.toBeInTheDocument()

    const details = screen.getByText('Read full context').closest('details')
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Read full context'))
    expect(details).toHaveAttribute('open')
    expect(screen.getByText('The complete market narrative remains available here.')).toBeInTheDocument()
  })

  it('uses one refresh action for drivers and narrative', () => {
    const refreshDrivers = vi.fn()
    const refreshSummary = vi.fn()

    render(
      <MarketInsights
        marketTakeaway="Markets are mixed."
        onRefreshResponses={refreshDrivers}
        onRefreshSummary={refreshSummary}
        responsesApiBullets={bullets}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refreshDrivers).toHaveBeenCalledOnce()
    expect(refreshSummary).toHaveBeenCalledOnce()
  })
})
