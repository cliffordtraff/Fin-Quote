import Logo from '@/components/Logo'

const footerColumns = [
  {
    title: 'Product',
    items: [
      'Dashboard snapshots and watchlists',
      'Chart workspace and saved layouts',
      'Fundamentals, estimates, and filings',
    ],
  },
  {
    title: 'Support',
    items: [
      'support@theintraday.com',
      'Mon-Fri, 8:00 AM to 6:00 PM CT',
      'Chicago, Illinois',
    ],
  },
  {
    title: 'Legal',
    items: [
      'Market data may be delayed',
      'For informational purposes only',
      'Terms, privacy, and disclosures',
    ],
  },
] as const

export default function DashboardFooter() {
  return (
    <footer className="border-t border-cream-300 bg-cream-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-[1400px] px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr]">
          <div className="max-w-xl">
            <Logo size="sm" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-sage-700 dark:text-sage-300">
              Market Research Workspace
            </p>
            <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-300">
              The Intraday combines market dashboards, charting, financial research, and
              fast daily context in one place. Market data is sourced through Financial
              Modeling Prep and Massive/Polygon-style feeds, financial and filing data is
              stored in Supabase, and OpenAI APIs power summaries and AI workflows.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerColumns.map((column) => (
              <section key={column.title}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-900 dark:text-gray-100">
                  {column.title}
                </h3>
                <div className="mt-4 space-y-2.5 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {column.items.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-cream-300 pt-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-200">
              &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
            </p>
            <p>Data sources include FMP, Massive/Polygon-style market feeds, SEC filings, Supabase, and OpenAI APIs.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span>Version 0.1</span>
            <span>APIs: FMP, Massive, OpenAI</span>
            <span>Data: Supabase + SEC filings</span>
            <span>Region: United States</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
