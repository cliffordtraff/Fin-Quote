'use client'

import Link from 'next/link'
import AppShell from '@/components/AppShell'

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <AppShell mainClassName="flex flex-1 items-center">
      <div className="mx-auto w-full max-w-xl px-6 py-16">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Market data unavailable
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">
          The overview could not be loaded.
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
          Live sections can fail independently. Retry the overview or continue
          to the session dashboard.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-sage-600 px-4 py-2 text-sm font-medium text-white hover:bg-sage-700 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950"
          >
            Try again
          </button>
          <Link
            href="/dashboard/pulse-today"
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Open Pulse Today
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
