import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StockSearch from '@/components/StockSearch'
import {
  NATIVE_TICKER_SEARCH_CLOSE_EVENT,
  NATIVE_TICKER_SEARCH_OPEN_EVENT,
  NATIVE_TICKER_SEARCH_STATE_EVENT,
} from '@/lib/native-ticker-search'

const pushMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('StockSearch', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'
    pushMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CHARTING_URL
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens the native ticker search when the launcher receives focus on workspace routes', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/workspace/overview" />)
    fireEvent.focus(screen.getByLabelText('Search ticker symbols'))

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect((handleOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({})

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('passes the first typed key through to the native ticker search on workspace routes', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/workspace/chart" />)
    fireEvent.keyDown(screen.getByLabelText('Search ticker symbols'), { key: 't' })

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect((handleOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({ query: 'T' })

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('does not open the charting-backed native search on stock routes when focused', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.focus(screen.getByLabelText('Search ticker symbols'))

    expect(handleOpen).not.toHaveBeenCalled()

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('queries the host-side stock search API on stock routes and routes selections locally', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { symbol: 'MSFT', name: 'Microsoft Corporation' },
          { symbol: 'META', name: 'Meta Platforms, Inc.' },
        ],
      }),
    })

    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText('Search ticker symbols')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ms' } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/search-stocks?q=MS', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
    }, { timeout: 1000 })

    const option = await screen.findByRole('option', { name: /MSFT/i })
    fireEvent.click(option)

    expect(pushMock).toHaveBeenCalledWith('/stock/MSFT')
  })

  it('seeds the stock-route search input from global typing instead of opening the charting modal', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.keyDown(document, { key: 't' })

    const input = screen.getByLabelText('Search ticker symbols') as HTMLInputElement
    expect(input.value).toBe('T')
    expect(handleOpen).not.toHaveBeenCalled()

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('closes the native ticker search on escape and reflects native open state on workspace routes', () => {
    const handleClose = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_CLOSE_EVENT, handleClose as EventListener)

    render(<StockSearch pathname="/workspace/chart" />)
    const input = screen.getByLabelText('Search ticker symbols')

    act(() => {
      window.dispatchEvent(new CustomEvent(NATIVE_TICKER_SEARCH_STATE_EVENT, {
        detail: { open: true },
      }))
    })

    expect(input).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(handleClose).toHaveBeenCalledTimes(1)
    expect((handleClose.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'host' })

    window.removeEventListener(NATIVE_TICKER_SEARCH_CLOSE_EVENT, handleClose as EventListener)
  })
})
