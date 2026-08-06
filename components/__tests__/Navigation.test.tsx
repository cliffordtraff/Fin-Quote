import { render, screen, waitFor } from '@testing-library/react'
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

describe('Navigation', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/stock/msft')
    window.history.replaceState({}, '', '/stock/msft')
    process.env.NEXT_PUBLIC_ENABLE_CHAT = 'false'
  })

  it('renders workspace links and passes the current pathname into stock search', () => {
    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Pulse Today' })).toHaveAttribute(
      'href',
      '/dashboard/pulse-today',
    )
    expect(screen.getByRole('link', { name: 'Morning Brief' })).toHaveAttribute(
      'href',
      '/dashboard/morning-brief',
    )
    expect(screen.getByRole('link', { name: 'Mid-Morning Brief' })).toHaveAttribute(
      'href',
      '/dashboard/mid-morning-brief',
    )
    expect(screen.getByRole('link', { name: 'Newsletter Ops' })).toHaveAttribute(
      'href',
      '/newsletter/operations',
    )
    expect(screen.getByRole('link', { name: 'Market Overview' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.getByRole('link', { name: 'Chart' })).toHaveAttribute('href', '/workspace/chart?symbol=MSFT')
    expect(screen.getByRole('link', { name: 'Fundamentals' })).toHaveAttribute('href', '/workspace/fundamentals?symbol=MSFT')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/workspace/overview?symbol=MSFT')
    expect(screen.getByTestId('stock-search')).toHaveAttribute('data-pathname', '/stock/msft')
    expect(screen.queryByRole('link', { name: 'Market Internals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Charting (Beta)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fundamentals Charting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Charting (Old)' })).not.toBeInTheDocument()
  })

  it('preserves workspace symbols from the query string', async () => {
    mockUsePathname.mockReturnValue('/workspace/overview')
    window.history.replaceState({}, '', '/workspace/overview?symbol=nvda')

    render(<Navigation />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Chart' })).toHaveAttribute('href', '/workspace/chart?symbol=NVDA')
      expect(screen.getByRole('link', { name: 'Financials' })).toHaveAttribute('href', '/stock/NVDA')
    })
  })

  it('marks the Morning Brief tab as the current page', () => {
    mockUsePathname.mockReturnValue('/dashboard/morning-brief')
    window.history.replaceState({}, '', '/dashboard/morning-brief')

    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Morning Brief' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Market Overview' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks the Mid-Morning Brief tab as the current page', () => {
    mockUsePathname.mockReturnValue('/dashboard/mid-morning-brief')
    window.history.replaceState({}, '', '/dashboard/mid-morning-brief')

    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Mid-Morning Brief' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Morning Brief' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks Newsletter Ops without also selecting Morning Report', () => {
    mockUsePathname.mockReturnValue('/newsletter/operations')
    window.history.replaceState({}, '', '/newsletter/operations')

    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Newsletter Ops' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Morning Report' })).not.toHaveAttribute(
      'aria-current',
    )
  })

})
