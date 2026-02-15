import Navigation from '@/components/Navigation'
import Dashboard2Content from '@/components/Dashboard2Content'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// ISR: regenerate every 60 seconds
export const revalidate = 60

export default async function Dashboard2() {
  // Fetch data on the server
  const initialData = await fetchAllMarketData()

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[rgb(28,28,28)] flex flex-col">
      <Navigation />
      <main className="py-6">
        <Dashboard2Content initialData={initialData} />
      </main>
    </div>
  )
}
