import Navigation from '@/components/Navigation'
import MarketDashboard3 from '@/components/MarketDashboard3'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Render dynamically (market data requires live API calls)
export const dynamic = 'force-dynamic'

export default async function Market3() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="py-4">
        <MarketDashboard3 initialData={initialData} />
      </main>
    </div>
  )
}
