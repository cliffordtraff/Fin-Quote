import Navigation from '@/components/Navigation'
import MarketSessions from '@/components/MarketSessions'
import EconomicCalendar from '@/components/EconomicCalendar'
import EarningsCalendar from '@/components/EarningsCalendar'
import { getEconomicEvents } from '@/app/actions/economic-calendar'
import { fetchEarningsCalendar } from '@/app/actions/earnings-calendar'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'

export default async function CalendarPage() {
  // Fetch all calendar data in parallel
  const [economicResult, earnings, indexQuotes, futuresQuotes] = await Promise.all([
    getEconomicEvents(),
    fetchEarningsCalendar(),
    getGlobalIndexQuotes(),
    getFuturesQuotes(),
  ])

  const economicEvents = 'events' in economicResult ? economicResult.events : []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Market Calendar</h1>

        {/* Market Sessions - Full Width */}
        <div className="mb-8">
          <MarketSessions indexQuotes={indexQuotes} futuresQuotes={futuresQuotes} />
        </div>

        {/* Economic & Earnings Calendars Side by Side */}
        <div className="flex gap-6">
          {/* Economic Calendar */}
          <div className="flex-1">
            <EconomicCalendar events={economicEvents} expanded />
          </div>

          {/* Earnings Calendar */}
          <div className="flex-1">
            <EarningsCalendar earnings={earnings} expanded />
          </div>
        </div>
      </main>
    </div>
  )
}
