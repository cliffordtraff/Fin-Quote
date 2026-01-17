'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <div className="w-full">
        <div className="flex justify-between items-center h-16 px-6">
          {/* Logo and Navigation Tabs */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
              Fin Quote
            </Link>
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
                Financials
              </Link>
              <Link
                href="/charts"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === '/charts'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Charts
              </Link>
              <Link
                href="/chatbot"
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === '/chatbot'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Chatbot
              </Link>
            </div>
          </div>

          {/* Right side: Theme toggle and User menu */}
          <div className="flex items-center space-x-6">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}
