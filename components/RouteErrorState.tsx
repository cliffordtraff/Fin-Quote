'use client'

import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'

export default function RouteErrorState({
  error,
  reset,
  title = 'This page hit a problem',
  description = 'Your saved data is unchanged. Retry the page, or return to the dashboard and continue from there.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  useEffect(() => {
    console.error('[route-error-boundary]', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center px-5 py-12">
      <section
        role="alert"
        aria-labelledby="route-error-title"
        className="w-full border border-red-200 bg-white p-6 shadow-sm dark:border-red-950 dark:bg-gray-900 sm:p-8"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1
              id="route-error-title"
              className="text-xl font-semibold text-gray-950 dark:text-white"
            >
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {description}
            </p>
            {error.digest ? (
              <p className="mt-2 text-xs text-gray-500">
                Reference {error.digest}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-600 dark:bg-white dark:text-gray-950"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-600 dark:border-gray-700 dark:text-gray-200"
          >
            Return to dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
