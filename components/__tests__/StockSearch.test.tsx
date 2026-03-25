import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StockSearch from '@/components/StockSearch'
import {
  NATIVE_TICKER_SEARCH_CLOSE_EVENT,
  NATIVE_TICKER_SEARCH_OPEN_EVENT,
  NATIVE_TICKER_SEARCH_STATE_EVENT,
} from '@/lib/native-ticker-search'

describe('StockSearch', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CHARTING_URL
  })

  it('opens the native ticker search when the launcher receives focus', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/workspace/overview" />)
    fireEvent.focus(screen.getByLabelText('Search ticker symbols'))

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect((handleOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({})

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('passes the first typed key through to the native ticker search', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/dashboard" />)
    fireEvent.keyDown(screen.getByLabelText('Search ticker symbols'), { key: 't' })

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect((handleOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({ query: 'T' })

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('opens the native ticker search from page typing on financials routes', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.keyDown(document, { key: 't' })

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect((handleOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({ query: 'T' })

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('does not steal typing from editable fields on financials routes', () => {
    const handleOpen = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)

    render(
      <>
        <StockSearch pathname="/stock/aapl" />
        <input aria-label="Editable field" />
      </>
    )

    const editable = screen.getByLabelText('Editable field')
    editable.focus()
    fireEvent.keyDown(editable, { key: 't' })

    expect(handleOpen).not.toHaveBeenCalled()

    window.removeEventListener(NATIVE_TICKER_SEARCH_OPEN_EVENT, handleOpen as EventListener)
  })

  it('closes the native ticker search on escape and reflects native open state', () => {
    const handleClose = vi.fn()
    window.addEventListener(NATIVE_TICKER_SEARCH_CLOSE_EVENT, handleClose as EventListener)

    render(<StockSearch pathname="/stock/aapl" />)
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
