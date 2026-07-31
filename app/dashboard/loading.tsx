import AppShell from '@/components/AppShell'

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-gray-200 dark:bg-gray-800 ${className}`}
    />
  )
}

export default function DashboardLoading() {
  return (
    <AppShell mainClassName="flex-1">
      <div
        aria-busy="true"
        aria-label="Loading market dashboard"
        className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8"
      >
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-56 rounded" />
            <SkeletonBlock className="h-4 w-80 max-w-full rounded" />
          </div>
          <SkeletonBlock className="hidden h-9 w-28 rounded sm:block" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock key={index} className="h-36 rounded-lg" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]">
          <SkeletonBlock className="h-[520px] rounded-lg" />
          <SkeletonBlock className="h-[520px] rounded-lg" />
        </div>
      </div>
    </AppShell>
  )
}
