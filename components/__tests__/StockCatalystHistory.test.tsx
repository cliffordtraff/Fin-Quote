import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StockCatalystHistory, {
  AsyncStockCatalystHistory,
} from '@/components/StockCatalystHistory'
import type { StockCatalystHistoryItem } from '@/lib/stock-catalyst-history'

function item(
  summaryDate: string,
  overrides: Partial<StockCatalystHistoryItem> = {},
): StockCatalystHistoryItem {
  return {
    summaryDate,
    summaryText: `Catalyst summary for ${summaryDate}.`,
    keyFact: null,
    reasonType: 'earnings',
    movePercent: null,
    generatedAt: `${summaryDate}T13:00:00.000Z`,
    source: null,
    ...overrides,
  }
}

describe('StockCatalystHistory', () => {
  it('renders newest entries first with safe evidence links and bounded disclosure', () => {
    const items = [
      item('2026-08-08', {
        keyFact: 'Revenue exceeded consensus.',
        movePercent: 4.25,
        source: {
          title: 'Apple reports quarterly results',
          publisher: 'Reuters',
          publishedAt: '2026-08-08T12:00:00.000Z',
          url: 'https://www.reuters.com/technology/apple-results',
        },
      }),
      item('2026-08-07', { reasonType: 'analyst_action', movePercent: -2.5 }),
      item('2026-08-06'),
      item('2026-08-05'),
    ]

    render(<StockCatalystHistory history={{ status: 'ready', items }} />)

    expect(screen.getByRole('heading', { name: 'Catalyst history' }))
      .toBeInTheDocument()
    expect(screen.getByText('4 entries')).toBeInTheDocument()
    expect(screen.getByText('Aug 8, 2026')).toBeInTheDocument()
    expect(screen.getByText('+4.25%')).toBeInTheDocument()
    expect(screen.getByText('-2.50%')).toBeInTheDocument()
    expect(screen.getByText('Key fact:')).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: /Reuters: Apple reports quarterly results/i,
      }),
    ).toHaveAttribute(
      'href',
      'https://www.reuters.com/technology/apple-results',
    )

    const disclosure = screen.getByText('Show 1 earlier catalysts')
    fireEvent.click(disclosure)
    expect(screen.getByText('Aug 5, 2026')).toBeInTheDocument()
  })

  it('keeps an unavailable secondary feed visible without replacing the page', () => {
    render(
      <StockCatalystHistory
        history={{ status: 'unavailable', reason: 'query', items: [] }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Recent catalyst history is temporarily unavailable',
    )
    expect(screen.getByText(/Price, filings, and news remain available/i))
      .toBeInTheDocument()
  })

  it('removes only the exact current-banner duplicate from history', async () => {
    const currentSummary = 'Apple moved after reporting quarterly results.'
    const tree = await AsyncStockCatalystHistory({
      historyPromise: Promise.resolve({
        status: 'ready',
        items: [
          item('2026-08-08', { summaryText: currentSummary }),
          item('2026-08-07'),
        ],
      }),
      currentSummaryText: currentSummary,
    })

    render(tree)

    expect(screen.queryByText(currentSummary)).not.toBeInTheDocument()
    expect(screen.getByText('Catalyst summary for 2026-08-07.'))
      .toBeInTheDocument()
    expect(screen.getByText('1 entry')).toBeInTheDocument()
  })

  it('keeps nonmatching history while the current banner remains separate', async () => {
    const historySummary = 'An older catalyst remains useful context.'
    const tree = await AsyncStockCatalystHistory({
      historyPromise: Promise.resolve({
        status: 'ready',
        items: [item('2026-08-01', { summaryText: historySummary })],
      }),
      currentSummaryText: 'A new catalyst explains today\'s move.',
    })

    render(tree)

    expect(screen.getByText(historySummary)).toBeInTheDocument()
    expect(screen.getByText('1 entry')).toBeInTheDocument()
  })

  it('does not render an empty history section', () => {
    const { container } = render(
      <StockCatalystHistory history={{ status: 'empty', items: [] }} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
