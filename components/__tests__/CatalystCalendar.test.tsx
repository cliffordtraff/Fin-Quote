import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CatalystCalendar from '@/components/CatalystCalendar'
import { buildCatalystCalendarModel } from '@/lib/catalyst-calendar'

function populatedModel() {
  return buildCatalystCalendarModel({
    referenceTime: '2026-08-03T18:00:00Z',
    feeds: {
      economic: { status: 'ready', totalCount: 1, truncated: false },
      earnings: { status: 'ready', totalCount: 1, truncated: false },
    },
    economicEvents: [{
      date: '2026-08-03 08:30:00',
      country: 'US',
      event: 'ISM Manufacturing',
      currency: 'USD',
      previous: 49,
      estimate: 50,
      actual: null,
      impact: 'High',
      unit: '',
    }],
    earnings: [{
      symbol: 'AAPL',
      name: 'Apple Inc.',
      date: '2026-08-04',
      time: 'bmo',
      eps: null,
      epsEstimated: 1.2,
      revenue: null,
      revenueEstimated: null,
    }],
  })
}

describe('CatalystCalendar', () => {
  it('opens on the first useful upcoming day and exposes day/type filters', () => {
    render(<CatalystCalendar model={populatedModel()} />)

    expect(screen.getByText('AAPL · Apple Inc.')).toBeInTheDocument()
    expect(screen.queryByText('ISM Manufacturing')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tuesday/ })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /^Week/ }))
    expect(screen.getByText('ISM Manufacturing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Economic/i }))
    expect(screen.getByText('ISM Manufacturing')).toBeInTheDocument()
    expect(screen.queryByText('AAPL · Apple Inc.')).not.toBeInTheDocument()
  })

  it('links earnings directly to the canonical stock page', () => {
    render(<CatalystCalendar model={populatedModel()} />)

    expect(screen.getByRole('link', { name: /AAPL · Apple Inc.*Open stock page/i }))
      .toHaveAttribute('href', '/stock/AAPL')
  })

  it('keeps loaded items visible when one provider fails', () => {
    const model = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T18:00:00Z',
      feeds: {
        economic: { status: 'unavailable', totalCount: 0, truncated: false },
        earnings: { status: 'ready', totalCount: 1, truncated: false },
      },
      economicEvents: [],
      earnings: [{
        symbol: 'AAPL',
        name: 'Apple Inc.',
        date: '2026-08-04',
        time: 'bmo',
        eps: null,
        epsEstimated: 1.2,
        revenue: null,
        revenueEstimated: null,
      }],
    })

    render(<CatalystCalendar model={model} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/Economic releases are temporarily unavailable/i)
    expect(screen.getByText('AAPL · Apple Inc.')).toBeInTheDocument()
  })

  it('renders distinct authoritative-empty and total-unavailability states', () => {
    const empty = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T12:00:00Z',
      feeds: {
        economic: { status: 'empty', totalCount: 0, truncated: false },
        earnings: { status: 'empty', totalCount: 0, truncated: false },
      },
      economicEvents: [],
      earnings: [],
    })
    const { rerender } = render(<CatalystCalendar model={empty} />)
    expect(screen.getByText('No scheduled catalysts this week')).toBeInTheDocument()

    rerender(
      <CatalystCalendar
        model={{
          ...empty,
          feeds: {
            economic: { status: 'unavailable', totalCount: 0, truncated: false },
            earnings: { status: 'unavailable', totalCount: 0, truncated: false },
          },
        }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Economic and earnings feeds are temporarily unavailable/i)
    expect(screen.getByText('Catalyst data is unavailable right now')).toBeInTheDocument()
  })

  it('announces an empty filter result and can clear the filters', () => {
    render(<CatalystCalendar model={populatedModel()} />)

    fireEvent.click(screen.getByRole('button', { name: /Wednesday/ }))
    expect(screen.getByText('No catalysts match these filters')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('ISM Manufacturing')).toBeInTheDocument()
    expect(screen.getByText('AAPL · Apple Inc.')).toBeInTheDocument()
  })

  it('discloses when a bounded provider feed omits qualifying rows', () => {
    const model = populatedModel()
    model.feeds.earnings = { status: 'ready', totalCount: 105, truncated: true }

    render(<CatalystCalendar model={model} />)

    expect(screen.getByText(/first 1 of 105 qualifying earnings/i)).toBeInTheDocument()
  })
})
