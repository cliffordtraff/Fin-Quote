import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceIframe from '@/components/WorkspaceIframe'
import { WORKSPACE_FOOTER_HEIGHT_PX } from '@/lib/workspace-layout'
import { NATIVE_TICKER_SEARCH_OPEN_EVENT } from '@/lib/native-ticker-search'

const mockUsePathname = vi.fn()
const mockUseSearchParams = vi.fn()
const mockUseTheme = vi.fn()
const pushMock = vi.fn()
const postMessage = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => mockUseSearchParams(),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => mockUseTheme(),
}))

describe('WorkspaceIframe', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/workspace/fundamentals')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('symbol=nvda'))
    mockUseTheme.mockReturnValue({ theme: 'dark' })
    process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'
    pushMock.mockReset()
    postMessage.mockReset()

    document.body.innerHTML = '<nav id="app-navigation"></nav>'
    const nav = document.getElementById('app-navigation')
    if (nav) {
      nav.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 0,
        height: 96,
        top: 0,
        right: 0,
        bottom: 96,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect
    }

    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        return { postMessage }
      },
    })

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    })
  })

  it('builds the iframe src for workspace routes and keeps the iframe mounted when hidden', async () => {
    const { rerender } = render(<WorkspaceIframe />)

    await waitFor(() => {
      expect(screen.getByTitle('Workspace charting')).toHaveAttribute(
        'src',
        'https://charts.theintraday.com/tos/NVDA?embed=true&view=fundamentals&theme=dark'
      )
    })
    expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ bottom: `${WORKSPACE_FOOTER_HEIGHT_PX}px` })

    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    rerender(<WorkspaceIframe />)

    expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ display: 'none' })
    expect(screen.getByTitle('Workspace charting')).toBeInTheDocument()
  })

  it('sends the initial workspace mode after the iframe reports ready on first load', async () => {
    mockUsePathname.mockReturnValue('/workspace/chart')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('symbol=tsla'))

    render(<WorkspaceIframe />)

    await waitFor(() => {
      expect(screen.getByTitle('Workspace charting')).toHaveAttribute(
        'src',
        'https://charts.theintraday.com/tos/TSLA?embed=true&view=price&theme=dark'
      )
    })
    expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ bottom: '0px' })

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://charts.theintraday.com',
        data: { v: 1, type: 'READY', payload: { version: '1.0.0' } },
      }))
    })

    await waitFor(() => {
      expect(
        postMessage.mock.calls.some(([message, origin]) => {
          return origin === 'https://charts.theintraday.com'
            && message?.type === 'SET_WORKSPACE_MODE'
            && message?.payload?.mode === 'price'
        })
      ).toBe(true)
    })
  })

  it('sends workspace mode messages after the iframe reports ready', async () => {
    const { rerender } = render(<WorkspaceIframe />)

    await waitFor(() => {
      expect(screen.getByTitle('Workspace charting')).toBeInTheDocument()
    })

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://charts.theintraday.com',
        data: { v: 1, type: 'READY', payload: { version: '1.0.0' } },
      }))
    })

    postMessage.mockClear()
    mockUsePathname.mockReturnValue('/workspace/overview')
    rerender(<WorkspaceIframe />)

    await waitFor(() => {
      expect(
        postMessage.mock.calls.some(([message, origin]) => {
          return origin === 'https://charts.theintraday.com'
            && message?.type === 'SET_WORKSPACE_MODE'
            && message?.payload?.mode === 'overview'
        })
      ).toBe(true)
    })
  })

  it('retries workspace mode sync after a route change so the first post-refresh switch is not lost', async () => {
    mockUsePathname.mockReturnValue('/workspace/overview')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('symbol=nvda'))

    const { rerender } = render(<WorkspaceIframe />)

    await waitFor(() => {
      expect(screen.getByTitle('Workspace charting')).toHaveAttribute(
        'src',
        'https://charts.theintraday.com/tos/NVDA?embed=true&view=overview&theme=dark'
      )
    })

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://charts.theintraday.com',
        data: { v: 1, type: 'READY', payload: { version: '1.0.0' } },
      }))
    })

    vi.useFakeTimers()
    postMessage.mockClear()
    mockUsePathname.mockReturnValue('/workspace/chart')
    rerender(<WorkspaceIframe />)

    expect(
      postMessage.mock.calls.some(([message, origin]) => {
        return origin === 'https://charts.theintraday.com'
          && message?.type === 'SET_WORKSPACE_MODE'
          && message?.payload?.mode === 'price'
      })
    ).toBe(true)

    const priceModeMessagesBeforeRetry = postMessage.mock.calls.filter(([message, origin]) => {
      return origin === 'https://charts.theintraday.com'
        && message?.type === 'SET_WORKSPACE_MODE'
        && message?.payload?.mode === 'price'
    }).length

    act(() => {
      vi.advanceTimersByTime(400)
    })

    const priceModeMessagesAfterRetry = postMessage.mock.calls.filter(([message, origin]) => {
      return origin === 'https://charts.theintraday.com'
        && message?.type === 'SET_WORKSPACE_MODE'
        && message?.payload?.mode === 'price'
    }).length

    expect(priceModeMessagesAfterRetry).toBeGreaterThan(priceModeMessagesBeforeRetry)
  })

  it('opens the native search modal off-workspace and routes selected symbols back through the host app', async () => {
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())

    render(<WorkspaceIframe />)

    act(() => {
      window.dispatchEvent(new CustomEvent(NATIVE_TICKER_SEARCH_OPEN_EVENT, {
        detail: { query: 'tsla' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByTitle('Workspace charting')).toHaveAttribute(
        'src',
        'https://charts.theintraday.com/tos/AAPL?embed=true&view=price&theme=dark'
      )
      expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ display: 'block' })
      expect(screen.getByTestId('workspace-iframe-search-backdrop')).toBeInTheDocument()
    })

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://charts.theintraday.com',
        data: { v: 1, type: 'READY', payload: { version: '1.0.0' } },
      }))
    })

    await waitFor(() => {
      expect(
        postMessage.mock.calls.some(([message, origin]) => {
          return origin === 'https://charts.theintraday.com'
            && message?.type === 'SET_EMBED_SURFACE_MODE'
            && message?.payload?.mode === 'search-only'
        })
      ).toBe(true)
      expect(
        postMessage.mock.calls.some(([message, origin]) => {
          return origin === 'https://charts.theintraday.com'
            && message?.type === 'SET_TICKER_SEARCH_QUERY'
            && message?.payload?.query === 'TSLA'
        })
      ).toBe(true)
    })

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://charts.theintraday.com',
        data: { v: 1, type: 'TICKER_SELECTED', payload: { symbol: 'TSLA' } },
      }))
    })

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/stock/TSLA')
      expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ display: 'none' })
    })
  })

  it('shows an actionable error when the local charting app never becomes ready', () => {
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_CHARTING_URL = 'http://localhost:3001'

    render(<WorkspaceIframe />)

    expect(screen.getByTitle('Workspace charting')).toHaveAttribute(
      'src',
      'http://localhost:3001/tos/NVDA?embed=true&view=fundamentals&theme=dark'
    )

    act(() => {
      vi.advanceTimersByTime(12000)
    })

    expect(screen.getByTestId('workspace-iframe-load-error')).toHaveTextContent('Workspace app is unavailable.')
    expect(screen.getByTestId('workspace-iframe-load-error')).toHaveTextContent('Nothing responded at http://localhost:3001.')
  })
})
