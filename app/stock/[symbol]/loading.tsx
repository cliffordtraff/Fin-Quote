export default function StockLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-800">
      {/* Navigation placeholder */}
      <div className="h-20 bg-cream-50 dark:bg-gray-800" />

      {/* Header skeleton */}
      <div className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-gray-800/90">
        <div className="mx-auto max-w-7xl h-full px-4 sm:px-6 lg:px-8 flex items-center">
          <div className="flex items-center justify-between w-full animate-pulse">
            <div className="flex items-end gap-3">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Chart skeleton */}
      <div className="mx-auto max-w-7xl px-4 pt-0 pb-2 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-cream-50 dark:bg-gray-800 p-6">
          <div className="animate-pulse">
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>

      {/* Stats grid skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-cream-50 dark:bg-gray-800 p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                {[...Array(14)].map((_, j) => (
                  <div
                    key={j}
                    className="flex justify-between border-b border-cream-300 dark:border-gray-700 pb-1"
                  >
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* News skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-cream-50 dark:bg-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-20 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
