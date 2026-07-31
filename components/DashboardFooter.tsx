import Logo from '@/components/Logo'

export default function DashboardFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} The Intraday. All rights reserved.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Market data may be delayed</span>
          <span>For informational purposes only</span>
          <span>FMP · Massive · SEC</span>
        </div>
      </div>
    </footer>
  )
}
