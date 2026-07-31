'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  const navScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setWorkspaceSymbol(normalizeSymbol(params.get('symbol')))
  }, [pathname])

  useEffect(() => {
    const activeLink = navScrollRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (typeof activeLink?.scrollIntoView !== 'function') return
    activeLink.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
  }, [pathname])

  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = normalizeSymbol(stockMatch ? stockMatch[1] : workspaceSymbol)

  const workspaceHref = (path: string) => {
    if (!currentSymbol) return path
    return `${path}?symbol=${encodeURIComponent(currentSymbol)}`
  }

  const navLinks: NavLink[] = [
    { href: '/dashboard/pulse-today', label: 'Pulse Today', match: '/dashboard/pulse-today' },
    { href: '/dashboard/morning-brief', label: 'Morning Brief', match: '/dashboard/morning-brief' },
    { href: '/dashboard/mid-morning-brief', label: 'Mid-Morning Brief', match: '/dashboard/mid-morning-brief' },
    { href: '/newsletter/morning-review', label: 'Morning Report', match: '/newsletter/morning-review' },
    { href: '/newsletter/operations', label: 'Newsletter Ops', match: '/newsletter/operations' },
    { href: '/dashboard', label: 'Market Overview' },
    { href: '/dashboard/premarket', label: 'Pre-Market', match: '/dashboard/premarket' },
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

    return `shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-xs font-medium transition-colors sm:px-4 ${
      isActive
        ? 'border-sage-600 text-gray-950 dark:border-sage-400 dark:text-white'
        : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white'
    }`
  }

  return (
    <nav
      id="app-navigation"
      aria-label="Primary"
      className="sticky top-0 z-50 overflow-x-hidden border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95"
    >
      <div className="w-full border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] min-w-0 items-center px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <div className="shrink-0 sm:hidden">
              <Logo size="md" showText={false} />
            </div>
            <div className="hidden shrink-0 sm:block">
              <Logo size="md" />
            </div>
            <StockSearch pathname={pathname} />
          </div>
        </div>
      </div>

      <div className="w-full bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto flex h-11 w-full max-w-[1600px] min-w-0 items-center sm:px-6 lg:px-8">
          <div
            ref={navScrollRef}
            className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex w-max items-center space-x-1 px-3 sm:px-0">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass(link)}
                  aria-current={
                    link.match
                      ? pathname?.startsWith(link.match)
                        ? 'page'
                        : undefined
                      : pathname === link.href
                        ? 'page'
                        : undefined
                  }
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center space-x-1 border-l border-gray-200 bg-gray-50 px-2 dark:border-gray-800 dark:bg-gray-950 sm:space-x-2 sm:pr-0">
            <TimezoneSelector />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  )
}
