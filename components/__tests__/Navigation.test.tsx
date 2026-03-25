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
  default: () => <div>Search</div>,
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

  it('renders workspace links and the renamed old charting link', () => {
    render(<Navigation />)

    expect(screen.getByRole('link', { name: 'Chart' })).toHaveAttribute('href', '/workspace/chart?symbol=MSFT')
    expect(screen.getByRole('link', { name: 'Fundamentals' })).toHaveAttribute('href', '/workspace/fundamentals?symbol=MSFT')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/workspace/overview?symbol=MSFT')
    expect(screen.getByRole('link', { name: 'Charting (Old)' })).toHaveAttribute('href', '/charts-experiment')
    expect(screen.queryByRole('link', { name: 'Charting (Beta)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fundamentals Charting' })).not.toBeInTheDocument()
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
})
