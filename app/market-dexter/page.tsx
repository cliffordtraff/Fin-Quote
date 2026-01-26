import Navigation from '@/components/Navigation'
import MarketDashboardDexter from '@/components/MarketDashboardDexter'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Disable caching for Dexter page - we want fresh research
export const dynamic = 'force-dynamic'

export default async function MarketDexter() {
  // Fetch market data only - Dexter will be called client-side to avoid blocking
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)] flex flex-col">
      <Navigation />
      <main className="py-4">
        <MarketDashboardDexter initialData={initialData} initialDexterSummary={null} />
      </main>
    </div>
  )
}
