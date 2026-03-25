import Navigation from '@/components/Navigation'
import MarketSessions from '@/components/MarketSessions'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'

export default async function CalendarPage() {
  const [indexQuotes, futuresQuotes] = await Promise.all([
    getGlobalIndexQuotes(),
    getFuturesQuotes(),
  ])

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MarketSessions indexQuotes={indexQuotes} futuresQuotes={futuresQuotes} />
      </main>
    </div>
  )
}
