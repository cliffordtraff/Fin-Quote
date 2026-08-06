import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Navigation from '@/components/Navigation'

const mockUsePathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/Logo', () => ({
  default: () => <div>Logo</div>,
}))

vi.mock('@/components/ThemeToggle', () => ({
  default: () => <button>Theme</button>,
}))

vi.mock('@/components/UserMenu', () => ({
  default: () => <div>User</div>,
}))

vi.mock('@/components/StockSearch', () => ({
  default: ({ pathname }: { pathname?: string | null }) => (
    <div data-testid="stock-search" data-pathname={pathname ?? ''}>Search</div>
  ),
}))

vi.mock('@/components/TimezoneSelector', () => ({
  default: () => <div>Timezone</div>,
}))

function openDesktopGroup(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('Navigation', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/stock/msft')
    window.history.replaceState({}, '', '/stock/msft')
    process.env.NEXT_PUBLIC_ENABLE_CHAT = 'false'
    process.env.NEXT_PUBLIC_SHOW_STOCK_V1 = 'false'
  })

  it('organizes every public destination into understandable groups', () => {
    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Pulse' })).toHaveAttribute(
      'href',
      '/dashboard/pulse-today',
    )

    openDesktopGroup('Briefings')
    expect(screen.getByRole('link', { name: /Morning Brief/ })).toHaveAttribute(
      'href',
      '/dashboard/morning-brief',
    )
    expect(screen.getByRole('link', { name: /Mid-Morning Update/ })).toHaveAttribute(
      'href',
      '/dashboard/mid-morning-brief',
    )

    openDesktopGroup('Markets')
    expect(screen.getByRole('link', { name: /Market Dashboard/ })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.getByRole('link', { name: /Pre-Market Sheet/ })).toHaveAttribute(
      'href',
      '/dashboard/premarket',
    )
    expect(screen.getByRole('link', { name: /Global Sessions/ })).toHaveAttribute(
      'href',
      '/calendar',
    )
    expect(screen.getByRole('link', { name: /Insider Activity/ })).toHaveAttribute(
      'href',
      '/insiders',
    )

    openDesktopGroup('MSFT Research')
    expect(screen.getByRole('link', { name: /Price Chart/ })).toHaveAttribute(
      'href',
      '/workspace/chart?symbol=MSFT',
    )
    expect(screen.getByRole('link', { name: /Fundamentals Chart/ })).toHaveAttribute(
      'href',
      '/workspace/fundamentals?symbol=MSFT',
    )
    expect(screen.getByRole('link', { name: /Company Overview/ })).toHaveAttribute(
      'href',
      '/workspace/overview?symbol=MSFT',
    )
    expect(screen.getByRole('link', { name: /Financial Statements/ })).toHaveAttribute(
      'href',
      '/stock/MSFT',
    )

    openDesktopGroup('Newsletter')
    expect(screen.getByRole('link', { name: /Morning Production Report/ })).toHaveAttribute(
      'href',
      '/newsletter/morning-review',
    )
    expect(screen.queryByRole('link', { name: 'Newsletter Operations' })).not.toBeInTheDocument()
    expect(screen.getByTestId('stock-search')).toHaveAttribute('data-pathname', '/stock/msft')
    expect(screen.queryByRole('link', { name: 'Market Internals' })).not.toBeInTheDocument()
  })

  it('preserves workspace symbols from the query string', async () => {
    mockUsePathname.mockReturnValue('/workspace/overview')
    window.history.replaceState({}, '', '/workspace/overview?symbol=nvda')

    render(<Navigation />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'NVDA Research' })).toBeInTheDocument()
    })

    openDesktopGroup('NVDA Research')
    expect(screen.getByRole('link', { name: /Price Chart/ })).toHaveAttribute(
      'href',
      '/workspace/chart?symbol=NVDA',
    )
    expect(screen.getByRole('link', { name: /Financial Statements/ })).toHaveAttribute(
      'href',
      '/stock/NVDA',
    )
  })

  it('marks the active briefing and its group without selecting a sibling', () => {
    mockUsePathname.mockReturnValue('/dashboard/morning-brief')
    window.history.replaceState({}, '', '/dashboard/morning-brief')

    render(<Navigation />)
    openDesktopGroup('Briefings')

    expect(screen.getByRole('link', { name: /Morning Brief/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Mid-Morning Update/ })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('makes the complete mobile navigation discoverable and Escape-dismissable', () => {
    render(<Navigation />)

    const browseButton = screen.getByRole('button', { name: 'Browse' })
    fireEvent.click(browseButton)

    expect(browseButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Morning' })).toHaveAttribute(
      'href',
      '/dashboard/morning-brief',
    )
    expect(screen.getByRole('link', { name: 'Global' })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: 'Financials' })).toHaveAttribute('href', '/stock/MSFT')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(browseButton).toHaveAttribute('aria-expanded', 'false')
    expect(browseButton).toHaveFocus()
  })

  it('keeps operator tooling out of public navigation while identifying its context', () => {
    mockUsePathname.mockReturnValue('/newsletter/operations')
    window.history.replaceState({}, '', '/newsletter/operations')

    render(<Navigation />)

    expect(screen.getByText('Newsletter Operations')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Newsletter Operations' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Newsletter' }).className).toContain('border-sage-600')
  })
})
