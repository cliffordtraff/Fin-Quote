'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-gray-50 dark:bg-[rgb(33,33,33)]">
      {/* Top Header Row */}
      <div className="w-full border-b border-gray-200 dark:border-gray-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          <Link href="/" className="text-lg font-bold text-gray-900 dark:text-white">
            The Intraday
          </Link>
        </div>
      </div>
      {/* Navigation Tabs Row */}
      <div className="w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
          {/* Navigation Tabs */}
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              <Link
                href="/"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === '/'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Market
              </Link>
              <Link
                href="/stock/aapl"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname?.startsWith('/stock')
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Company
              </Link>
              <Link
                href="/charts"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === '/charts'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Charting
              </Link>
              <Link
                href="/chatbot"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === '/chatbot'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Chat
              </Link>
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
