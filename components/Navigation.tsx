'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'
import TimezoneSelector from './TimezoneSelector'

interface NavLink {
  href: string
  label: string
  match?: string
  external?: boolean
  icon?: React.ReactNode
}

export default function Navigation() {
  const pathname = usePathname()

  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = stockMatch ? stockMatch[1].toUpperCase() : null

  const navLinks: NavLink[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/live', label: 'Live', match: '/dashboard/live' },
    { href: '/dashboard/pulse', label: 'Pulse', match: '/dashboard/pulse' },
    { href: '/dashboard/pulse-lab', label: 'Pulse Lab', match: '/dashboard/pulse-lab' },
    { href: '/dashboard/pulse-lab-2', label: 'Lab 2', match: '/dashboard/pulse-lab-2' },
    { href: '/dashboard/pulse-today', label: 'Pulse Today', match: '/dashboard/pulse-today' },
    { href: '/dashboard/pulse-text', label: 'Pulse Text', match: '/dashboard/pulse-text' },
    { href: '/dashboard/pulse-testing', label: 'Pulse Testing', match: '/dashboard/pulse-testing' },
    { href: '/dashboard/review-day', label: 'Review Day', match: '/dashboard/review-day' },
    { href: currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL', label: 'Financials', match: '/stock' },
    { href: '/charts', label: 'Charting' },
    { href: '/charts-experiment', label: 'Charting Experiment', match: '/charts-experiment' },
    { href: '/charts-experiment-2', label: 'Charting Experiment 2', match: '/charts-experiment-2' },
    { href: '/concept', label: 'Market Internals' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/insiders', label: 'Insiders' },
  ]

  if (process.env.NEXT_PUBLIC_CHARTING_URL) {
    navLinks.splice(3, 0, {
      href: `${process.env.NEXT_PUBLIC_CHARTING_URL}/tos/${currentSymbol || 'AAPL'}`,
      label: 'Workspace (Beta)',
      external: true,
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      ),
    })
  }

  if (process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true') {
    navLinks.push({ href: '/chatbot', label: 'Chat' })
  }

  const linkClass = (link: NavLink) => {
    const isActive = link.match
      ? pathname?.startsWith(link.match)
      : pathname === link.href

    return `px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
        : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
    }`
  }

  return (
    <nav className="bg-white dark:bg-gray-900 border-b-2 border-sage-500">
      {/* Top Header Row */}
      <div className="w-full border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Logo size="md" />
            <StockSearch />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Row */}
      <div className="w-full bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              {navLinks.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkClass(link)} inline-flex items-center gap-1`}
                  >
                    {link.label}
                    {link.icon}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className={linkClass(link)}>
                    {link.label}
                  </Link>
                )
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <TimezoneSelector />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}
