'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'

export default function Navigation() {
  return (
    <nav className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(26,26,26)]">
      <div className="w-full px-52">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
              Fin Quote
            </Link>
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
