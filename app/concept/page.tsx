import type { Metadata } from 'next'
import Link from 'next/link'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Market Internals | The Intraday',
  description:
    'Verified market-breadth analysis from The Intraday. Historical internals are temporarily unavailable while the data pipeline is validated.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function MarketInternalsPage() {
  return (
    <AppShell mainClassName="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-sage-700 dark:text-sage-300">
          Market breadth
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
          Market Internals
        </h1>
      </header>

      <section
        aria-labelledby="market-internals-status"
        className="overflow-hidden rounded-lg border border-cream-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="border-b border-cream-300 bg-cream-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            Data validation in progress
          </span>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10">
          <div className="max-w-2xl">
            <h2
              id="market-internals-status"
              className="text-xl font-semibold text-gray-950 dark:text-white"
            >
              Historical market breadth is temporarily unavailable
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              We removed the placeholder history from this page. Market Internals
              will return after its advance-decline history is backed by a verified,
              reproducible market-data source.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Until then, use the live market views below. They only display data
              returned by the production market-data pipeline.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/pulse-today"
                className="rounded-lg bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sage-800 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Open Pulse Today
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sage-500 dark:hover:text-sage-300 dark:focus:ring-offset-gray-800"
              >
                Open Market Overview
              </Link>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
