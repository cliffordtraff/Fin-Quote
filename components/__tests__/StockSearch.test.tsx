import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StockSearch from '@/components/StockSearch'
import {
  NATIVE_TICKER_SEARCH_CLOSE_EVENT,
  NATIVE_TICKER_SEARCH_OPEN_EVENT,
  NATIVE_TICKER_SEARCH_STATE_EVENT,
} from '@/lib/native-ticker-search'

const pushMock = vi.fn()
const fetchMock = vi.fn()

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

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
        degraded: false,
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
    const controlledListboxId = input.getAttribute('aria-controls')
    const activeOptionId = input.getAttribute('aria-activedescendant')
    expect(controlledListboxId).toBeTruthy()
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(controlledListboxId!)).toHaveAttribute(
      'role',
      'listbox',
    )
    expect(activeOptionId).toBe(option.id)
    expect(document.getElementById(activeOptionId!)).toBe(option)
    fireEvent.click(option)

    expect(pushMock).toHaveBeenCalledWith('/stock/MSFT')
  })

  it('distinguishes a temporary search outage from an authoritative empty result', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Search unavailable' }),
    })

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'apple' },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search is temporarily unavailable.',
    )
    expect(screen.queryByText('No matches found.')).not.toBeInTheDocument()
  })

  it('shows no matches only after a successful empty search', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], degraded: false }),
    })

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'zzzz' },
    })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('No matches found.')
    })
    const input = screen.getByLabelText('Search ticker symbols')
    expect(input).toHaveAttribute('aria-busy', 'false')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps loading and empty states announced without dangling combobox references', async () => {
    const pendingSearch = deferred<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>()
    fetchMock.mockReturnValueOnce(pendingSearch.promise)

    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText('Search ticker symbols')
    fireEvent.change(input, { target: { value: 'missing company' } })

    expect(await screen.findByRole('status')).toHaveTextContent('Searching...')
    expect(input).toHaveAttribute('aria-busy', 'true')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    pendingSearch.resolve({
      ok: true,
      status: 200,
      json: async () => ({ results: [], degraded: false }),
    })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('No matches found.')
    })
    expect(input).toHaveAttribute('aria-busy', 'false')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('preserves company-name spaces in the controlled input and canonicalizes only the request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], degraded: false }),
    })

    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText('Search ticker symbols') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bank of america' } })

    expect(input.value).toBe('BANK OF AMERICA')
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-stocks?q=BANK%20OF%20AMERICA',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
  })

  it('lets native paste compose with the current value and selection', () => {
    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText(
      'Search ticker symbols',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bank' } })
    input.setSelectionRange(input.value.length, input.value.length)

    const paste = createEvent.paste(input, {
      clipboardData: { getData: () => ' of america' },
    })
    fireEvent(input, paste)
    expect(paste.defaultPrevented).toBe(false)

    // jsdom does not perform the browser's native paste mutation, so mirror
    // the resulting input event after proving the component left it intact.
    fireEvent.change(input, { target: { value: 'BANK of america' } })
    expect(input).toHaveValue('BANK OF AMERICA')
  })

  it('shows a visible warning while keeping degraded fallback results usable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
        degraded: true,
      }),
    })

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'apple' },
    })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Showing S&P 500 results while full-market search is temporarily unavailable.',
      )
    })
    fireEvent.click(screen.getByRole('option', { name: /AAPL/i }))
    expect(pushMock).toHaveBeenCalledWith('/stock/AAPL')
  })

  it.each([
    { results: [] },
    { results: 'not-an-array', degraded: false },
    { results: [{ symbol: '', name: '' }], degraded: false },
    { results: [], degraded: true },
  ])('treats a runtime-invalid success envelope as unavailable: %j', async (payload) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    })

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'apple' },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search is temporarily unavailable.',
    )
    expect(screen.queryByText('No matches found.')).not.toBeInTheDocument()
  })

  it.each(['fetch', 'body'])('enforces the client deadline when %s ignores abort', async (stall) => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() =>
      stall === 'fetch'
        ? new Promise(() => undefined)
        : Promise.resolve({
            ok: true,
            status: 200,
            json: () => new Promise(() => undefined),
          }),
    )

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'apple' },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Search is temporarily unavailable.',
    )
    expect(screen.queryByText('Searching...')).not.toBeInTheDocument()
  })

  it('treats a current-request AbortError as an outage', async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException('connection aborted', 'AbortError'),
    )

    render(<StockSearch pathname="/stock/aapl" />)
    fireEvent.change(screen.getByLabelText('Search ticker symbols'), {
      target: { value: 'apple' },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search is temporarily unavailable.',
    )
    expect(screen.queryByText('No matches found.')).not.toBeInTheDocument()
  })

  it('generation-fences a late abort-resistant response from a newer query', async () => {
    vi.useFakeTimers()
    const oldBody = deferred<unknown>()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => oldBody.promise,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ symbol: 'MSFT', name: 'Microsoft Corporation' }],
          degraded: false,
        }),
      })

    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText('Search ticker symbols')
    fireEvent.change(input, { target: { value: 'apple' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    fireEvent.change(input, { target: { value: 'microsoft' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
      await flushMicrotasks()
    })
    expect(screen.getByRole('option', { name: /MSFT/i })).toBeInTheDocument()

    oldBody.resolve({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
      degraded: false,
    })
    await act(async () => {
      await flushMicrotasks()
    })
    expect(screen.queryByRole('option', { name: /AAPL/i })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /MSFT/i })).toBeInTheDocument()
  })

  it('does not submit stale results while a replacement query is loading', async () => {
    const replacement = deferred<{
      ok: boolean
      status: number
      json: () => Promise<unknown>
    }>()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ symbol: 'AAPL', name: 'Apple Inc.' }],
          degraded: false,
        }),
      })
      .mockReturnValueOnce(replacement.promise)

    render(<StockSearch pathname="/stock/aapl" />)
    const input = screen.getByLabelText('Search ticker symbols')
    fireEvent.change(input, { target: { value: 'apple' } })
    expect(await screen.findByRole('option', { name: /AAPL/i })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'microsoft' } })
    expect(screen.getByRole('status')).toHaveTextContent('Searching...')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(pushMock).not.toHaveBeenCalled()
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    replacement.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ symbol: 'MSFT', name: 'Microsoft Corporation' }],
        degraded: false,
      }),
    })
    expect(await screen.findByRole('option', { name: /MSFT/i })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
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
