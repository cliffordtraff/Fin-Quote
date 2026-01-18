import Link from 'next/link'
import Navigation from '@/components/Navigation'

export default function StockNotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-[rgb(45,45,45)]">
      <Navigation />

      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-6xl mb-4">📉</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Stock Not Found
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
          The stock symbol you&apos;re looking for doesn&apos;t exist in our database or isn&apos;t
          currently supported. We support S&amp;P 500 stocks.
        </p>
        <div className="flex gap-4">
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Market Dashboard
          </Link>
          <Link
            href="/stock/AAPL"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            View Apple (AAPL)
          </Link>
        </div>
      </div>
    </div>
  )
}
