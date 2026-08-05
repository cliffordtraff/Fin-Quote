import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StocksTable from '@/components/StocksTable'

vi.mock('@/components/TickerLink', () => ({
  default: ({ symbol }: { symbol: string }) => <a href={`/stock/${symbol}`}>{symbol}</a>,
}))

const stocks = [
  { symbol: 'AAPL', name: 'Apple', price: 210, change: 8, changePercent: 4.2 },
  { symbol: 'TSLA', name: 'Tesla', price: 450, change: -4, changePercent: -0.9 },
]

describe('StocksTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks unusual moves and reports keyboard reorder changes', () => {
    const onSymbolsChange = vi.fn()
    render(<StocksTable stocks={stocks} onSymbolsChange={onSymbolsChange} />)

    expect(screen.getByText('1 unusual')).toBeInTheDocument()
    expect(screen.getByLabelText('Unusual move')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Move TSLA up' }))
    expect(onSymbolsChange).toHaveBeenCalledWith(['TSLA', 'AAPL'])
  })

  it('validates and adds a quote-backed ticker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 190, change: 3, changesPercentage: 1.61 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const onSymbolsChange = vi.fn()

    render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL']}
        onSymbolsChange={onSymbolsChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'nvda' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(onSymbolsChange).toHaveBeenCalledWith(['AAPL', 'NVDA'])
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/quote/NVDA')
  })
})
