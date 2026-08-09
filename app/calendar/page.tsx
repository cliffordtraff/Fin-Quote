import AppShell from '@/components/AppShell'
import CatalystCalendar from '@/components/CatalystCalendar'
import MarketSessions from '@/components/MarketSessions'
import { getGlobalIndexQuotes, getFuturesQuotes } from '@/app/actions/global-indices'
import { fetchEarningsCalendarForCatalystCalendar } from '@/app/actions/earnings-calendar'
import { getEconomicEventsForCatalystCalendar } from '@/app/actions/economic-calendar'
import { buildCatalystCalendarModel } from '@/lib/catalyst-calendar'

export const revalidate = 300

export default async function CalendarPage() {
  const referenceTime = new Date().toISOString()

  // Start every independent read before awaiting any one of them.
  const indexQuotesPromise = getGlobalIndexQuotes()
  const futuresQuotesPromise = getFuturesQuotes()
  const earningsPromise = fetchEarningsCalendarForCatalystCalendar(referenceTime)
  const economicPromise = getEconomicEventsForCatalystCalendar(referenceTime)

  const [indexQuotes, futuresQuotes, earningsResult, economicResult] = await Promise.all([
    indexQuotesPromise,
    futuresQuotesPromise,
    earningsPromise,
    economicPromise,
  ])

  const earnings = 'earnings' in earningsResult ? earningsResult.earnings : []
  const economicEvents = 'events' in economicResult ? economicResult.events : []
  const model = buildCatalystCalendarModel({
    earnings,
    economicEvents,
    referenceTime,
    feeds: {
      earnings: {
        status: 'error' in earningsResult
          ? 'unavailable'
          : earnings.length === 0
            ? 'empty'
            : 'ready',
        totalCount: 'error' in earningsResult ? 0 : earningsResult.totalCount,
        truncated: 'error' in earningsResult ? false : earningsResult.truncated,
      },
      economic: {
        status: 'error' in economicResult
          ? 'unavailable'
          : economicEvents.length === 0
            ? 'empty'
            : 'ready',
        totalCount: 'error' in economicResult ? 0 : economicResult.totalCount,
        truncated: 'error' in economicResult ? false : economicResult.truncated,
      },
    },
  })

  return (
    <AppShell mainClassName="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <CatalystCalendar model={model} />

      <header className="mb-6 mt-10">
        <p className="text-xs font-medium uppercase text-sage-700 dark:text-sage-300">
          Global Markets
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
          International Sessions
        </h2>
      </header>
      <MarketSessions indexQuotes={indexQuotes} futuresQuotes={futuresQuotes} />
    </AppShell>
  )
}
