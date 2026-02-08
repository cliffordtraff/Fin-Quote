'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'
import TimezoneSelector from './TimezoneSelector'

export default function Navigation() {
  const pathname = usePathname()

  // Extract current stock symbol from path if on a stock page
  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = stockMatch ? stockMatch[1].toUpperCase() : null

  return (
    <nav className="bg-white dark:bg-gray-900 border-b-2 border-sage-500">
      {/* Top Header Row */}
      <div className="w-full border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sage-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M18 9l-5 5-4-4-3 3" />
                </svg>
              </div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">The Intraday</span>
            </Link>
            <StockSearch />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Row */}
      <div className="w-full bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          {/* Navigation Tabs */}
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              {process.env.NEXT_PUBLIC_ENABLE_MARKET === 'true' && (
                <Link
                  href="/"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/'
                      ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                  }`}
                >
                  Market Test
                </Link>
              )}

              {process.env.NEXT_PUBLIC_ENABLE_MARKET2 === 'true' && (
                <Link
                  href="/market2"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/market2'
                      ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                  }`}
                >
                  Market 2
                </Link>
              )}

              {process.env.NEXT_PUBLIC_ENABLE_MARKET3 === 'true' && (
                <Link
                  href="/market"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/market'
                      ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                  }`}
                >
                  Market
                </Link>
              )}

              <Link
                href="/dashboard"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/dashboard'
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Dashboard
              </Link>

              {process.env.NEXT_PUBLIC_ENABLE_DEXTER === 'true' && (
                <Link
                  href="/market-dexter"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/market-dexter'
                      ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                  }`}
                >
                  Market Dexter
                </Link>
              )}

              <Link
                href={currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL'}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname?.startsWith('/stock')
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Financials
              </Link>

              <Link
                href="/charts"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/charts'
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Charting
              </Link>

              <Link
                href="/concept"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/concept'
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Market Internals
              </Link>

              <Link
                href="/calendar"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/calendar'
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Calendar
              </Link>

              <Link
                href="/insiders"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/insiders'
                    ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                }`}
              >
                Insiders
              </Link>

              {process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true' && (
                <Link
                  href="/chatbot"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/chatbot'
                      ? 'bg-sage-500/20 text-sage-700 dark:bg-sage-500/30 dark:text-sage-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-sage-500/10 dark:hover:bg-gray-800'
                  }`}
                >
                  Chat
                </Link>
              )}
            </div>
          </div>

          {/* Right side: Timezone, Theme toggle, and User menu */}
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
