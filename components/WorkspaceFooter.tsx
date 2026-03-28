'use client'

import { usePathname } from 'next/navigation'
import { WORKSPACE_FOOTER_HEIGHT_PX } from '@/lib/workspace-layout'

export default function WorkspaceFooter() {
  const pathname = usePathname()
  const showFooter = pathname?.startsWith('/workspace/fundamentals') || pathname?.startsWith('/workspace/overview')

  if (!showFooter) {
    return null
  }

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-cream-300 bg-cream-100 dark:border-gray-700 dark:bg-gray-900"
      style={{ height: WORKSPACE_FOOTER_HEIGHT_PX }}
    >
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-center px-6 text-center sm:px-12 lg:px-20">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
