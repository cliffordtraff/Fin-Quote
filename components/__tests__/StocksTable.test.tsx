import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StocksTable from '@/components/StocksTable'

vi.mock('@/components/TickerLink', () => ({
  default: ({ symbol }: { symbol: string }) => <a href={`/stock/${symbol}`}>{symbol}</a>,
}))

const stocks = [
  { symbol: 'AAPL', name: 'Apple', price: 210, change: 8, changePercent: 4.2 },
  { symbol: 'TSLA', name: 'Tesla', price: 450, change: -4, changePercent: -0.9 },
]

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function StatefulStocksTable({ initialSymbols }: { initialSymbols: string[] }) {
  const [symbols, setSymbols] = useState(initialSymbols)
  return (
    <StocksTable
      stocks={stocks}
      symbols={symbols}
      onSymbolsChange={setSymbols}
    />
  )
}

describe('StocksTable', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'false')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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

  it('rejects derivatives and enforces the cap before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onSymbolsChange = vi.fn()
    const full = Array.from({ length: 20 }, (_, index) => `T${index}`)

    const view = render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL']}
        onSymbolsChange={onSymbolsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'ES=F' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('valid stock ticker')
    })
    expect(fetchMock).not.toHaveBeenCalled()

    view.rerender(
      <StocksTable
        stocks={stocks}
        symbols={full}
        onSymbolsChange={onSymbolsChange}
      />,
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(full.length)
    })
    const quoteFetchCount = fetchMock.mock.calls.length
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'NVDA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('up to 20 symbols')
    })
    expect(fetchMock).toHaveBeenCalledTimes(quoteFetchCount)
  })

  it('loads all custom rows through one batch when sync is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      quotes: [
        {
          symbol: 'NVDA',
          name: 'NVIDIA',
          price: 190,
          change: 3,
          changesPercentage: 1.61,
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft',
          price: 510,
          change: -2,
          changesPercentage: -0.39,
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL', 'NVDA', 'MSFT']}
        onSymbolsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('+1.61%')).toBeInTheDocument()
      expect(screen.getByText('-0.39%')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/watchlist/quotes')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ symbols: ['NVDA', 'MSFT'] })
  })

  it('uses the bounded batch path when adding a symbol under the feature flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      quotes: [{
        symbol: 'NVDA',
        name: 'NVIDIA',
        price: 190,
        change: 3,
        changesPercentage: 1.61,
      }],
    }), { status: 200 }))
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/watchlist/quotes')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ symbols: ['NVDA'] })
  })

  it('does not resurrect an add after the user removes the visible row', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    const load = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(load.promise))

    render(<StatefulStocksTable initialSymbols={['AAPL']} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'MSFT' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove AAPL' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('watchlist changed')
    })
    expect(screen.getByText('Add a ticker to start your watchlist.')).toBeInTheDocument()

    load.resolve(new Response(JSON.stringify({
      quotes: [{
        symbol: 'MSFT',
        name: 'Microsoft',
        price: 510,
        change: 1,
        changesPercentage: 0.2,
      }],
    }), { status: 200 }))
    await Promise.resolve()
    expect(screen.queryByRole('link', { name: 'MSFT' })).not.toBeInTheDocument()
  })

  it('does not overwrite a reorder when a deferred add completes', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    const load = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(load.promise))

    render(<StatefulStocksTable initialSymbols={['AAPL', 'TSLA']} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'NVDA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move TSLA up' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('watchlist changed')
    })
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'TSLA',
      'AAPL',
    ])

    load.resolve(new Response(JSON.stringify({
      quotes: [{
        symbol: 'NVDA',
        name: 'NVIDIA',
        price: 190,
        change: 3,
        changesPercentage: 1.61,
      }],
    }), { status: 200 }))
    await Promise.resolve()
    expect(screen.queryByRole('link', { name: 'NVDA' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'TSLA',
      'AAPL',
    ])
  })

  it('announces unavailable quotes and retries without hiding last-good rows', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    const retryLoad = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockReturnValueOnce(retryLoad.promise)
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const view = render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL', 'NVDA']}
        onSymbolsChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'temporarily unavailable',
      )
    })
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(view.container.querySelector('[aria-busy="false"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading watchlist')
    expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull()
    retryLoad.resolve(new Response(JSON.stringify({
      quotes: [{
        symbol: 'NVDA',
        name: 'NVIDIA',
        price: 190,
        change: 3,
        changesPercentage: 1.61,
      }],
    }), { status: 200 }))
    await waitFor(() => {
      expect(screen.getByText('+1.61%')).toBeInTheDocument()
    })

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Showing last available quotes',
      )
    })
    expect(screen.getByText('+1.61%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('announces uncertain account sync, disables unsafe edits, and retries', () => {
    const onSymbolsChange = vi.fn()
    const onSyncRetry = vi.fn()
    render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL', 'TSLA']}
        onSymbolsChange={onSymbolsChange}
        editingDisabled
        syncStatus="uncertain"
        syncMessage="The save may have completed. Retry safely."
        syncCacheAvailable={false}
        syncCanRetry
        onSyncRetry={onSyncRetry}
      />,
    )

    expect(screen.getByText('Save uncertain')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('save may have completed')
    expect(screen.getByRole('status')).toHaveTextContent('offline retry receipts')
    expect(screen.getByRole('button', { name: '+ Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move TSLA up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove AAPL' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onSyncRetry).toHaveBeenCalledTimes(1)
    expect(onSymbolsChange).not.toHaveBeenCalled()
  })

  it('fences a deferred add when account sync becomes unsafe', async () => {
    const quote = deferred<{
      ok: boolean
      json: () => Promise<{ price: number; change: number; changesPercentage: number }>
    }>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(quote.promise))
    const onSymbolsChange = vi.fn()
    const view = render(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL']}
        onSymbolsChange={onSymbolsChange}
        syncStatus="ready"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Ticker symbol' }), {
      target: { value: 'NVDA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    view.rerender(
      <StocksTable
        stocks={stocks}
        symbols={['AAPL']}
        onSymbolsChange={onSymbolsChange}
        editingDisabled
        syncStatus="saving"
        syncMessage="Saving account watchlist…"
      />,
    )
    await act(async () => quote.resolve({
      ok: true,
      json: async () => ({ price: 190, change: 3, changesPercentage: 1.61 }),
    }))

    await waitFor(() => {
      expect(screen.getAllByRole('status').some((status) => (
        status.textContent?.includes('Wait for account sync')
      ))).toBe(true)
    })
    expect(onSymbolsChange).not.toHaveBeenCalled()
  })
})
