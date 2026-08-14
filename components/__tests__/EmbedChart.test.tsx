import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmbedChart from '@/components/EmbedChart'

const postMessage = vi.fn()
const iframeWindow = { postMessage } as unknown as Window

function expectedHostOrigin() {
  try {
    const origin = new URL(window.location.href).origin
    return origin === 'null' ? 'https://markets.theintraday.com' : origin
  } catch {
    return 'https://markets.theintraday.com'
  }
}

describe('EmbedChart', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CHARTING_URL = 'http://localhost:3001'
    document.documentElement.classList.remove('dark')
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    })
    postMessage.mockReset()
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        return iframeWindow
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.NEXT_PUBLIC_CHARTING_URL
    vi.unstubAllGlobals()
  })

  it('uses the configured charting URL and current host origin', async () => {
    render(<EmbedChart symbol="AAPL" />)

    await waitFor(() => {
      expect(screen.getByTitle('AAPL price chart')).toHaveAttribute(
        'src',
        `http://localhost:3001/embed?symbol=AAPL&tf=D&range=1y&theme=light&toolbar=simplified&surface=page&origin=${encodeURIComponent(expectedHostOrigin())}`
      )
    })
  })

  it('tracks dark mode in the embed iframe src', async () => {
    document.documentElement.classList.add('dark')

    render(<EmbedChart symbol="MSFT" />)

    await waitFor(() => {
      expect(screen.getByTitle('MSFT price chart')).toHaveAttribute(
        'src',
        `http://localhost:3001/embed?symbol=MSFT&tf=D&range=1y&theme=dark&toolbar=simplified&surface=page&origin=${encodeURIComponent(expectedHostOrigin())}`
      )
    })
  })

  it('waits for an origin- and source-validated READY handshake', async () => {
    render(<EmbedChart symbol="AAPL" />)

    const iframe = await screen.findByTitle('AAPL price chart')
    fireEvent.load(iframe)
    expect(screen.getByText('Loading chart...')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:3001',
        source: iframeWindow,
        data: { v: 1, type: 'READY', payload: {} },
      }))
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading chart...')).not.toBeInTheDocument()
      expect(iframe).toHaveStyle({ opacity: '1' })
    })
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('keeps a ready chart visible when the embed reports a recoverable interaction error', async () => {
    render(<EmbedChart symbol="AAPL" />)

    const iframe = await screen.findByTitle('AAPL price chart')
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:3001',
        source: iframeWindow,
        data: { v: 1, type: 'READY', payload: {} },
      }))
    })

    await waitFor(() => expect(iframe).toHaveStyle({ opacity: '1' }))

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:3001',
        source: iframeWindow,
        data: {
          v: 1,
          type: 'ERROR',
          payload: { code: 'THEME_CHANGE', recoverable: true },
        },
      }))
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(iframe).toHaveStyle({ opacity: '1' })
  })

  it('shows recovery actions when the chart never becomes ready', async () => {
    vi.useFakeTimers()
    render(<EmbedChart symbol="AAPL" />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTitle('AAPL price chart')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable')
    expect(screen.getByRole('link', { name: 'Open chart separately' })).toHaveAttribute(
      'href',
      'http://localhost:3001/tos-full/AAPL',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Loading chart...')).toBeInTheDocument()
  })
})
