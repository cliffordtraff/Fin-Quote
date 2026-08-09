import AppShell from '@/components/AppShell'

export default function CalendarLoading() {
  return (
    <AppShell mainClassName="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading catalyst calendar and global market sessions</span>
        <div className="animate-pulse overflow-hidden rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-3 h-8 w-64 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </div>
        <div className="mt-10 h-80 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
      </div>
    </AppShell>
  )
}
