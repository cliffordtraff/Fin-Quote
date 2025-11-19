'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import UserMenu from './UserMenu'
import { useTheme } from '@/components/ThemeProvider'

const WATCHLIST_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SUNDAY_WATCHLIST !== 'false'

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  const emitWatchlistEvent = useCallback((type: string) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(type))
  }, [])

  const handleThemeToggle = useCallback(() => {
    toggleTheme()
    emitWatchlistEvent('watchlist:theme:toggle')
  }, [toggleTheme, emitWatchlistEvent])

  const navLinks = [
    { href: '/market', label: 'Market', active: pathname === '/market' },
    { href: '/', label: 'Chatbot', active: pathname === '/' },
    { href: '/stock/aapl', label: 'Financials', active: pathname?.startsWith('/stock') ?? false }
  ]

  return (
    <nav className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <div className="w-full">
        <div className="flex justify-between items-center" style={{ height: '64px', padding: '0 24px' }}>
          <div className="flex items-center" style={{ columnGap: '32px', minWidth: 0 }}>
            <Link href="/" className="font-bold text-gray-900 dark:text-white" style={{ fontSize: '20px' }}>
              Fin Quote
            </Link>
            <div className="flex items-center" style={{ columnGap: '8px', minWidth: 0 }}>
              {navLinks.map(({ href, label, active }) => (
                <Link
                  key={label}
                  href={href}
                  className={`font-medium transition-colors ${
                    active ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                >
                  {label}
                </Link>
              ))}
              {WATCHLIST_ENABLED && (
                <Link
                  href="/watchlist"
                  className={`font-medium transition-colors ${
                    pathname === '/watchlist' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}
                >
                  Watchlist
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center" style={{ columnGap: '24px', minWidth: 0 }}>
            {WATCHLIST_ENABLED && (
              <div className="flex items-center" style={{ columnGap: '8px' }}>
                <button
                  type="button"
                  onClick={() => emitWatchlistEvent('watchlist:font-scale:decrease')}
                  className="rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition dark:border-white/40 dark:text-white dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center"
                  style={{ width: '32px', height: '32px', fontSize: '20px' }}
                  title="Decrease text size"
                  aria-label="Decrease text size"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => emitWatchlistEvent('watchlist:font-scale:increase')}
                  className="rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition dark:border-white/40 dark:text-white dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center"
                  style={{ width: '32px', height: '32px', fontSize: '20px' }}
                  title="Increase text size"
                  aria-label="Increase text size"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition dark:border-white/40 dark:text-white dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center"
                  style={{ width: '32px', height: '32px' }}
                  aria-label="Toggle light/dark theme"
                  title="Toggle light/dark theme"
                >
                  {theme === 'light' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/news')}
                  className="rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition text-[14px] font-medium dark:border-white/40 dark:text-white dark:bg-white/10 dark:hover:bg-white/20"
                  style={{ height: '32px', padding: '0 12px' }}
                >
                  News
                </button>
              </div>
            )}
            <div style={{ flexShrink: 0 }}>
              <UserMenu />
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
