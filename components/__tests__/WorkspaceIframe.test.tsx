import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceIframe from '@/components/WorkspaceIframe'

const mockUsePathname = vi.fn()
const mockUseSearchParams = vi.fn()
const mockUseTheme = vi.fn()
const postMessage = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => mockUseTheme(),
}))

describe('WorkspaceIframe', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/workspace/fundamentals')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('symbol=nvda'))
    mockUseTheme.mockReturnValue({ theme: 'dark' })
    process.env.NEXT_PUBLIC_CHARTING_URL = 'https://charts.theintraday.com'
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

    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    rerender(<WorkspaceIframe />)

    expect(screen.getByTestId('workspace-iframe-shell')).toHaveStyle({ display: 'none' })
    expect(screen.getByTitle('Workspace charting')).toBeInTheDocument()
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
})
