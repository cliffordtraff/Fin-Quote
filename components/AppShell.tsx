import type { ReactNode } from 'react'
import Navigation from '@/components/Navigation'
import DashboardFooter from '@/components/DashboardFooter'

interface AppShellProps {
  children?: ReactNode
  mainClassName?: string
  showFooter?: boolean
}

export default function AppShell({
  children,
  mainClassName = 'min-w-0 flex-1',
  showFooter = false,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-cream-100 text-gray-950 dark:bg-gray-950 dark:text-gray-100">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 bg-gray-950 px-3 py-2 text-sm font-medium text-white focus:translate-y-0 dark:bg-white dark:text-gray-950"
      >
        Skip to content
      </a>
      <Navigation />
      <main id="main-content" className={mainClassName}>
        {children}
      </main>
      {showFooter ? <DashboardFooter /> : null}
    </div>
  )
}
