'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'
import TimezoneSelector from './TimezoneSelector'

interface NavLink {
  href: string
  label: string
  match?: string
}

function normalizeSymbol(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

export default function Navigation() {
  const pathname = usePathname()
  const [workspaceSymbol, setWorkspaceSymbol] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setWorkspaceSymbol(normalizeSymbol(params.get('symbol')))
  }, [pathname])

  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = normalizeSymbol(stockMatch ? stockMatch[1] : workspaceSymbol)

  const workspaceHref = (path: string) => {
    if (!currentSymbol) return path
    return `${path}?symbol=${encodeURIComponent(currentSymbol)}`
  }

  const navLinks: NavLink[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/pulse-today', label: 'Most Active', match: '/dashboard/pulse-today' },
    { href: workspaceHref('/workspace/chart'), label: 'Chart', match: '/workspace/chart' },
    { href: workspaceHref('/workspace/fundamentals'), label: 'Fundamentals', match: '/workspace/fundamentals' },
    { href: workspaceHref('/workspace/overview'), label: 'Overview', match: '/workspace/overview' },
    { href: '/concept', label: 'Market Internals' },
    { href: currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL', label: 'Financials', match: '/stock' },
    ...(process.env.NEXT_PUBLIC_SHOW_STOCK_V1 === 'true'
      ? [{ href: currentSymbol ? `/stock-v1/${currentSymbol}` : '/stock-v1/AAPL', label: 'Financials (v1)', match: '/stock-v1' }]
      : []),
    { href: '/calendar', label: 'International' },
    { href: '/insiders', label: 'Insiders' },
  ]

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
    <nav id="app-navigation" className="bg-white dark:bg-gray-900 border-b-2 border-sage-500">
      <div className="w-full border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-[1600px] px-6 sm:px-12 lg:px-20 flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <Logo size="md" />
            <StockSearch pathname={pathname} />
          </div>
        </div>
      </div>

      <div className="w-full bg-cream-100 dark:bg-gray-900">
        <div className="mx-auto max-w-[1600px] px-6 sm:px-12 lg:px-20 flex justify-between items-center h-10">
          <div className="flex items-center">
            <div className="flex items-center space-x-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass(link)}>
                  {link.label}
                </Link>
              ))}
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
