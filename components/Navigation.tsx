'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'

export default function Navigation() {
  const pathname = usePathname()

  // Extract current stock symbol from path if on a stock or company page
  const stockMatch = pathname?.match(/^\/(stock|company)\/([^/]+)/)
  const currentSymbol = stockMatch ? stockMatch[2].toUpperCase() : null

  return (
    <nav className="bg-gray-50 dark:bg-[rgb(33,33,33)]">
      {/* Top Header Row */}
      <div className="w-full border-b border-gray-200 dark:border-gray-700">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-medium text-gray-900 dark:text-white">
              The Intraday
            </Link>
            <StockSearch />
          </div>
        </div>
      </div>
      {/* Navigation Tabs Row */}
      <div className="w-full">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          {/* Navigation Tabs */}
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              {process.env.NEXT_PUBLIC_ENABLE_MARKET === 'true' && (
                <Link
                  href="/"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  Market
                </Link>
              )}
              <Link
                href="/market-sunday"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/market-sunday'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Market Sunday
              </Link>
              <Link
                href="/market-dexter"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/market-dexter'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Market Dexter
              </Link>
              <Link
                href={currentSymbol ? `/company/${currentSymbol}` : '/company/AAPL'}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname?.startsWith('/company')
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Company
              </Link>
              <Link
                href={currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL'}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname?.startsWith('/stock')
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Financials
              </Link>
              <Link
                href="/charts"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/charts'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Charting
              </Link>
              <Link
                href="/concept"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/concept'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Market Internals
              </Link>
              <Link
                href="/calendar"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/calendar'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Calendar
              </Link>
              <Link
                href="/insiders"
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  pathname === '/insiders'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Insiders
              </Link>
              {process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true' && (
                <Link
                  href="/chatbot"
                  className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                    pathname === '/chatbot'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  Chat
                </Link>
              )}
            </div>
          </div>

          {/* Right side: Theme toggle and User menu */}
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}
