import Navigation from '@/components/Navigation'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Render dynamically (market data requires live API calls)
export const dynamic = 'force-dynamic'

export default async function MarketSunday() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="py-4">
        <MarketDashboardSunday initialData={initialData} />
      </main>
    </div>
  )
}
