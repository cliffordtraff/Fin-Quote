import Navigation from '@/components/Navigation'
import MarketDashboard2 from '@/components/MarketDashboard2'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Enable ISR with 60-second revalidation
export const revalidate = 60

export default async function Market2() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <MarketDashboard2 initialData={initialData} />
      </main>
    </div>
  )
}
