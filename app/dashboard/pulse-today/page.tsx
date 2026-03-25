import Navigation from '@/components/Navigation'
import PulseTodayDashboard from '@/components/PulseTodayDashboard'
import { getAllSessionMovers } from '@/app/actions/market-movers'

export const revalidate = 60

export default async function PulseTodayPage() {
  const [gainersResult, losersResult] = await Promise.all([
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
  ])

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <PulseTodayDashboard
          gainersData={{
            premarket: gainersResult.premarket,
            cash: gainersResult.cash,
            afterhours: gainersResult.afterhours,
            currentSession: gainersResult.currentSession,
          }}
          losersData={{
            premarket: losersResult.premarket,
            cash: losersResult.cash,
            afterhours: losersResult.afterhours,
            currentSession: losersResult.currentSession,
          }}
        />
      </main>
    </div>
  )
}
