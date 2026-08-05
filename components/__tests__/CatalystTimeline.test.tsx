import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CatalystTimeline, { buildCatalystItems } from '@/components/CatalystTimeline'

const economicEvents = [
  {
    date: '2026-08-04T12:30:00-04:00',
    event: 'Balance of Trade',
    previous: -77.6,
    estimate: -73,
    actual: null,
    impact: 'High',
    unit: 'B',
  },
]

const earnings = [
  {
    symbol: 'AES',
    name: 'AES Corporation',
    date: '2026-08-03',
    time: 'amc' as const,
    fiscalDateEnding: '2026-06-30',
    eps: null,
    epsEstimated: 0.45,
    revenue: null,
    revenueEstimated: null,
  },
]

const news = [
  {
    title: 'Stocks open higher',
    text: '',
    url: 'https://example.com/market',
    publishedDate: '2026-08-03T11:00:00-04:00',
    site: 'Example News',
  },
]

describe('CatalystTimeline', () => {
  it('places upcoming catalysts before already-published headlines', () => {
    const items = buildCatalystItems(
      economicEvents,
      earnings,
      news,
      new Date('2026-08-03T12:00:00-04:00').getTime(),
    )

    expect(items.map((item) => item.title)).toEqual([
      'AES · AES Corporation',
      'Balance of Trade',
      'Stocks open higher',
    ])
  })

  it('renders economic, earnings, and headline items in one feed', () => {
    render(
      <CatalystTimeline
        economicEvents={economicEvents}
        earnings={earnings}
        news={news}
        referenceTime="2026-08-03T12:00:00-04:00"
      />,
    )

    expect(screen.getByText('3 catalysts')).toBeInTheDocument()
    expect(screen.getByText('Balance of Trade')).toBeInTheDocument()
    expect(screen.getByText('AES · AES Corporation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Stocks open higher/ })).toHaveAttribute(
      'href',
      'https://example.com/market',
    )
  })
})
