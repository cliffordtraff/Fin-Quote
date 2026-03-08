import Navigation from '@/components/Navigation'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// ISR: regenerate every 60 seconds
export const revalidate = 60

export default async function Dashboard() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-4">
        <MarketDashboardSunday initialData={initialData} />
      </main>
    </div>
  )
}
