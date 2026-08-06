'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  Globe2,
  Menu,
  Newspaper,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import StockSearch from './StockSearch'
import TimezoneSelector from './TimezoneSelector'

interface NavItem {
  href: string
  label: string
  compactLabel: string
  description: string
  match?: string
}

interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

function normalizeSymbol(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

function isItemActive(pathname: string | null, item: NavItem) {
  return item.match ? pathname?.startsWith(item.match) : pathname === item.href
}

function NavigationLink({
  item,
  pathname,
  compact = false,
  onNavigate,
}: {
  item: NavItem
  pathname: string | null
  compact?: boolean
  onNavigate: () => void
}) {
  const isActive = isItemActive(pathname, item)

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`group flex min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
        isActive
          ? 'border-sage-300 bg-sage-50 text-gray-950 dark:border-sage-700 dark:bg-sage-900/40 dark:text-white'
          : 'border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-800'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition ${
          isActive
            ? 'bg-sage-600 dark:bg-sage-400'
            : 'bg-gray-300 group-hover:bg-sage-400 dark:bg-gray-600'
        }`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {compact ? item.compactLabel : item.label}
        </span>
        {compact ? null : (
          <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
            {item.description}
          </span>
        )}
      </span>
    </Link>
  )
}

export default function Navigation() {
  const pathname = usePathname()
  const [workspaceSymbol, setWorkspaceSymbol] = useState<string | null>(null)
  const [desktopMenuOpen, setDesktopMenuOpen] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const desktopMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const menuId = useId()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setWorkspaceSymbol(normalizeSymbol(params.get('symbol')))
    setDesktopMenuOpen(null)
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!desktopMenuOpen && !mobileMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (navRef.current?.contains(event.target as Node)) return
      setDesktopMenuOpen(null)
      setMobileMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (mobileMenuOpen) {
        setMobileMenuOpen(false)
        mobileMenuButtonRef.current?.focus()
        return
      }

      if (desktopMenuOpen) {
        const menuToFocus = desktopMenuOpen
        setDesktopMenuOpen(null)
        desktopMenuButtonRefs.current[menuToFocus]?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [desktopMenuOpen, mobileMenuOpen])

  const stockMatch = pathname?.match(/^\/stock\/([^/]+)/)
  const currentSymbol = normalizeSymbol(stockMatch ? stockMatch[1] : workspaceSymbol)

  const workspaceHref = (path: string) => {
    if (!currentSymbol) return path
    return `${path}?symbol=${encodeURIComponent(currentSymbol)}`
  }

  const pulseItem: NavItem = {
    href: '/dashboard/pulse-today',
    label: 'Pulse',
    compactLabel: 'Pulse',
    description: 'Live leaders, catalysts, and intraday replay',
    match: '/dashboard/pulse-today',
  }

  const navGroups: NavGroup[] = [
    {
      id: 'briefings',
      label: 'Briefings',
      icon: Newspaper,
      items: [
        {
          href: '/dashboard/morning-brief',
          label: 'Morning Brief',
          compactLabel: 'Morning',
          description: 'Overnight tape and the setup for the open',
          match: '/dashboard/morning-brief',
        },
        {
          href: '/dashboard/mid-morning-brief',
          label: 'Mid-Morning Update',
          compactLabel: 'Mid-Morning',
          description: 'What changed after the opening bell',
          match: '/dashboard/mid-morning-brief',
        },
      ],
    },
    {
      id: 'markets',
      label: 'Markets',
      icon: Globe2,
      items: [
        {
          href: '/dashboard',
          label: 'Market Dashboard',
          compactLabel: 'Dashboard',
          description: 'Tape, movers, watchlist, and cross-asset context',
        },
        {
          href: '/dashboard/premarket',
          label: 'Pre-Market Sheet',
          compactLabel: 'Pre-Market',
          description: 'Overnight setup, futures, and early movers',
          match: '/dashboard/premarket',
        },
        {
          href: '/calendar',
          label: 'Global Sessions',
          compactLabel: 'Global',
          description: 'International clocks and index performance',
        },
        {
          href: '/insiders',
          label: 'Insider Activity',
          compactLabel: 'Insiders',
          description: 'Latest reported executive transactions',
        },
      ],
    },
    {
      id: 'company',
      label: currentSymbol ? `${currentSymbol} Research` : 'Company',
      icon: BarChart3,
      items: [
        {
          href: workspaceHref('/workspace/chart'),
          label: 'Price Chart',
          compactLabel: 'Chart',
          description: 'Technical charting and drawing workspace',
          match: '/workspace/chart',
        },
        {
          href: workspaceHref('/workspace/fundamentals'),
          label: 'Fundamentals Chart',
          compactLabel: 'Fundamentals',
          description: 'Compare financial metrics across time',
          match: '/workspace/fundamentals',
        },
        {
          href: workspaceHref('/workspace/overview'),
          label: 'Company Overview',
          compactLabel: 'Overview',
          description: 'A visual snapshot of company performance',
          match: '/workspace/overview',
        },
        {
          href: currentSymbol ? `/stock/${currentSymbol}` : '/stock/AAPL',
          label: 'Financial Statements',
          compactLabel: 'Financials',
          description: 'Price, filings, key statistics, and news',
          match: '/stock/',
        },
        ...(process.env.NEXT_PUBLIC_SHOW_STOCK_V1 === 'true'
          ? [{
              href: currentSymbol ? `/stock-v1/${currentSymbol}` : '/stock-v1/AAPL',
              label: 'Financials (v1)',
              compactLabel: 'Financials v1',
              description: 'Legacy stock research view',
              match: '/stock-v1',
            }]
          : []),
      ],
    },
    {
      id: 'newsletter',
      label: 'Newsletter',
      icon: FileText,
      items: [
        {
          href: '/newsletter/morning-review',
          label: 'Morning Production Report',
          compactLabel: 'Morning Report',
          description: 'Ranked stories, charts, and newsletter readiness',
          match: '/newsletter/morning-review',
        },
      ],
    },
  ]

  const chatItem: NavItem | null = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true'
    ? {
        href: '/chatbot',
        label: 'Research Chat',
        compactLabel: 'Chat',
        description: 'Ask questions about market and company data',
      }
    : null

  const operatorContextItem: NavItem = {
    href: '/newsletter/operations',
    label: 'Newsletter Operations',
    compactLabel: 'Operations',
    description: 'Delivery health and production controls',
    match: '/newsletter/operations',
  }

  const allItems = [pulseItem, ...navGroups.flatMap((group) => group.items), operatorContextItem]
  if (chatItem) allItems.push(chatItem)
  const activeItem = allItems.find((item) => isItemActive(pathname, item))

  const closeMenus = () => {
    setDesktopMenuOpen(null)
    setMobileMenuOpen(false)
  }

  return (
    <nav
      ref={navRef}
      id="app-navigation"
      aria-label="Primary"
      className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95"
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

      <div className="relative w-full bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto flex h-12 w-full max-w-[1600px] min-w-0 items-center px-3 lg:h-11 lg:px-8">
          <div
            data-testid="desktop-navigation"
            className="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
          >
            <Link
              href={pulseItem.href}
              aria-current={isItemActive(pathname, pulseItem) ? 'page' : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 ${
                isItemActive(pathname, pulseItem)
                  ? 'border-sage-600 text-gray-950 dark:border-sage-400 dark:text-white'
                  : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white'
              }`}
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              Pulse
            </Link>

            {navGroups.map((group) => {
              const GroupIcon = group.icon
              const isOpen = desktopMenuOpen === group.id
              const isActive = group.items.some((item) => isItemActive(pathname, item))
                || (group.id === 'newsletter' && Boolean(pathname?.startsWith('/newsletter/')))
              const dropdownId = `${menuId}-${group.id}`

              return (
                <div key={group.id} className="relative">
                  <button
                    ref={(node) => {
                      desktopMenuButtonRefs.current[group.id] = node
                    }}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={dropdownId}
                    onClick={() => {
                      setDesktopMenuOpen((current) => current === group.id ? null : group.id)
                      setMobileMenuOpen(false)
                    }}
                    className={`flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 ${
                      isActive
                        ? 'border-sage-600 text-gray-950 dark:border-sage-400 dark:text-white'
                        : isOpen
                          ? 'border-gray-300 bg-white text-gray-950 dark:border-gray-600 dark:bg-gray-900 dark:text-white'
                          : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white'
                    }`}
                  >
                    <GroupIcon className="h-4 w-4" aria-hidden="true" />
                    <span className="max-w-36 truncate">{group.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    id={dropdownId}
                    hidden={!isOpen}
                    className={`absolute top-[calc(100%+0.5rem)] w-[22rem] rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-700 dark:bg-gray-900 ${
                      group.id === 'newsletter' ? 'right-0' : 'left-0'
                    }`}
                    aria-label={`${group.label} destinations`}
                  >
                    <div className="px-3 pb-2 pt-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sage-700 dark:text-sage-300">
                        {group.label}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <NavigationLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          onNavigate={closeMenus}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}

            {chatItem ? (
              <Link
                href={chatItem.href}
                aria-current={isItemActive(pathname, chatItem) ? 'page' : undefined}
                className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${
                  isItemActive(pathname, chatItem)
                    ? 'border-sage-600 text-gray-950 dark:border-sage-400 dark:text-white'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white'
                }`}
              >
                <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                Chat
              </Link>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 items-center lg:hidden">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls={`${menuId}-mobile`}
              onClick={() => {
                setMobileMenuOpen((current) => !current)
                setDesktopMenuOpen(null)
              }}
              className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
            >
              {mobileMenuOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
              Browse
            </button>

            <p className="min-w-0 flex-1 truncate px-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
              {activeItem?.label ?? 'Explore The Intraday'}
            </p>
          </div>

          <div
            onPointerDown={() => {
              setDesktopMenuOpen(null)
              setMobileMenuOpen(false)
            }}
            className="flex shrink-0 items-center gap-1 border-l border-gray-200 pl-2 dark:border-gray-800"
          >
            <TimezoneSelector />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {mobileMenuOpen ? (
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 top-[6.625rem] z-40 bg-gray-950/40 backdrop-blur-[1px] lg:hidden"
          />
        ) : null}

        <div
          id={`${menuId}-mobile`}
          hidden={!mobileMenuOpen}
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100vh-6.625rem)] overflow-y-auto border-b border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950 lg:hidden"
        >
          <div className="mx-auto w-full max-w-2xl p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sage-700 dark:text-sage-300">
                  Explore
                </p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Markets, briefings, and company research
                </p>
              </div>
              {currentSymbol ? (
                <span className="rounded-full bg-sage-100 px-2.5 py-1 text-xs font-bold text-sage-800 dark:bg-sage-900/50 dark:text-sage-200">
                  {currentSymbol}
                </span>
              ) : null}
            </div>

            <NavigationLink
              item={pulseItem}
              pathname={pathname}
              compact
              onNavigate={closeMenus}
            />

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {navGroups.map((group) => {
                const GroupIcon = group.icon
                return (
                  <section
                    key={group.id}
                    aria-labelledby={`${menuId}-mobile-${group.id}`}
                    className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-800 dark:bg-gray-900/60"
                  >
                    <h2
                      id={`${menuId}-mobile-${group.id}`}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400"
                    >
                      <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="truncate">{group.label}</span>
                    </h2>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavigationLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          compact
                          onNavigate={closeMenus}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            {chatItem ? (
              <div className="mt-3">
                <NavigationLink
                  item={chatItem}
                  pathname={pathname}
                  compact
                  onNavigate={closeMenus}
                />
              </div>
            ) : null}

            <p className="mt-3 px-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Newsletter operations and account tools are available from your profile menu after sign-in.
            </p>
          </div>
        </div>
      </div>
    </nav>
  )
}
