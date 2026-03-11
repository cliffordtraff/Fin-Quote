import Navigation from '@/components/Navigation'
import LiveDashboard from '@/components/LiveDashboard'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import { getStockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'
import { getMarketStatus } from '@/lib/market-hours'

// ISR: regenerate every 60 seconds
export const revalidate = 60

export default async function LiveDashboardPage() {
  const marketStatus = getMarketStatus()

  // Fetch ES futures (24-hr S&P 500 data) and gainers in parallel
  const [esResult, gainersResult] = await Promise.all([
    getStockIntradayOHLC('ES=F'),
    getAllSessionMovers('gainers'),
  ])

  const initialEsData = esResult.data ?? null

  // Determine active gainers based on current session
  const { premarket, cash, afterhours, currentSession } = gainersResult
  let activeGainers = cash
  if (currentSession === 'premarket' && premarket.length > 0) {
    activeGainers = premarket
  } else if (currentSession === 'afterhours' && afterhours.length > 0) {
    activeGainers = afterhours
  } else if (currentSession === 'closed') {
    if (afterhours.length > 0) activeGainers = afterhours
    else if (cash.length > 0) activeGainers = cash
    else if (premarket.length > 0) activeGainers = premarket
  }

  // Pre-fetch OHLC for the top gainer (if any)
  let initialGainerOHLC = null
  if (activeGainers.length > 0) {
    const result = await getStockIntradayOHLC(activeGainers[0].symbol)
    if (result.data) {
      initialGainerOHLC = result.data
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <LiveDashboard
          initialEsData={initialEsData}
          initialGainers={activeGainers}
          initialGainerOHLC={initialGainerOHLC}
          initialSession={currentSession}
        />
      </main>
    </div>
  )
}
