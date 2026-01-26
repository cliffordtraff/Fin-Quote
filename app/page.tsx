import Navigation from '@/components/Navigation'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Enable ISR with 60-second revalidation
export const revalidate = 60

export default async function Home() {
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
