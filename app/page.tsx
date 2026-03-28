import LandingPage from '@/components/landing'
import Navigation from '@/components/Navigation'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { loadDashboardChartOfTheDayEmbedSpec } from '@/lib/dashboard/chart-of-the-day'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (process.env.NEXT_PUBLIC_ENABLE_LANDING === 'true') {
    return <LandingPage />
  }

  const initialData = await fetchAllMarketData()
  const chartOfDaySpec = await loadDashboardChartOfTheDayEmbedSpec()

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-4">
        <MarketDashboardSunday
          initialData={initialData}
          chartOfDaySpec={chartOfDaySpec}
        />
      </main>
    </div>
  )
}
