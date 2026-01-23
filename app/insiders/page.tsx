import Navigation from '@/components/Navigation'
import InsidersPageClient from '@/components/InsidersPageClient'
import { getLatestInsiderTrades } from '@/app/actions/insider-trading'

export const revalidate = 300 // ISR: revalidate every 5 minutes

export default async function InsidersPage() {
  const result = await getLatestInsiderTrades(200)
  const initialTrades = 'trades' in result ? result.trades : []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Insider Trading
        </h1>
        <InsidersPageClient initialTrades={initialTrades} />
      </main>
    </div>
  )
}
