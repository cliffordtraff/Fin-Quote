'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'
import TimezoneSelector from './TimezoneSelector'

export default function AppNavigation() {
  const pathname = usePathname()

  // Extract current stock symbol from path if on a stock page
  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = stockMatch ? stockMatch[1].toUpperCase() : null

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL', label: 'Financials', match: '/stock' },
    { href: '/charts', label: 'Charts' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/insiders', label: 'Insiders' },
  ]

  // Add conditional links based on feature flags
  const conditionalLinks = []
  if (process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true') {
    conditionalLinks.push({ href: '/chatbot', label: 'Chat' })
  }

  const allLinks = [...navLinks, ...conditionalLinks]

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b-2 border-sage-500">
      {/* Top Header Row */}
      <div className="w-full border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Logo size="md" href="/dashboard" />
            <StockSearch />
          </div>

          {/* Right side: Timezone, Theme toggle, and User menu */}
          <div className="flex items-center space-x-2">
            <TimezoneSelector />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Row */}
      <div className="w-full bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          {/* Navigation Tabs */}
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              {allLinks.map((link) => {
                const isActive = link.match
                  ? pathname?.startsWith(link.match)
                  : pathname === link.href

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
