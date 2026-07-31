import AppShell from '@/components/AppShell'
import PulseTodayDashboard from '@/components/PulseTodayDashboard'
import { getAllSessionMovers } from '@/app/actions/market-movers'

export const dynamic = 'force-dynamic'

export default async function PulseTodayPage() {
  const [gainersResult, losersResult] = await Promise.all([
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
  ])

  return (
    <AppShell mainClassName="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
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
    </AppShell>
  )
}
