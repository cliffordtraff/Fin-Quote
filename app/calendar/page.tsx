import AppShell from '@/components/AppShell'
import MarketSessions from '@/components/MarketSessions'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'

export default async function CalendarPage() {
  const [indexQuotes, futuresQuotes] = await Promise.all([
    getGlobalIndexQuotes(),
    getFuturesQuotes(),
  ])

  return (
    <AppShell mainClassName="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase text-sage-700 dark:text-sage-300">
          Global Markets
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
          International Sessions
        </h1>
      </header>
      <MarketSessions indexQuotes={indexQuotes} futuresQuotes={futuresQuotes} />
    </AppShell>
  )
}
