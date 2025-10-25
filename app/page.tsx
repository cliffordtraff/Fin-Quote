import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Fin Quote</h1>
        <p className="text-gray-600 mb-8">AI-Powered Finance Q&A Platform</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/ask"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ask Questions
          </Link>
          <Link
            href="/financials"
            className="inline-block bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            View Financials
          </Link>
        </div>
      </div>
    </div>
  )
}
