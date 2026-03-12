import Navigation from '@/components/Navigation'
import LiveDashboard from '@/components/LiveDashboard'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import { getStockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'
import type { ReplayConfig } from '@/lib/hooks/use-replay'
// ISR: regenerate every 60 seconds
export const revalidate = 60

function pickActiveMovers(result: Awaited<ReturnType<typeof getAllSessionMovers>>) {
  const { premarket, cash, afterhours, currentSession } = result
  if (currentSession === 'premarket' && premarket.length > 0) return premarket
  if (currentSession === 'afterhours' && afterhours.length > 0) return afterhours
  if (currentSession === 'closed') {
    if (afterhours.length > 0) return afterhours
    if (cash.length > 0) return cash
    if (premarket.length > 0) return premarket
  }
  return cash
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function LiveDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const replaySymbol = typeof params.replay === 'string' ? params.replay.toUpperCase() : null

  // Build replay config if ?replay= is present
  let replayConfig: ReplayConfig | null = null
  if (replaySymbol) {
    const today = new Date().toISOString().split('T')[0]
    const date = typeof params.date === 'string' ? params.date : today
    const from = typeof params.from === 'string' ? params.from : '09:30'
    const to = typeof params.to === 'string' ? params.to : '10:00'
    const tf = typeof params.timeframe === 'string' ? params.timeframe : '1s'
    const timeframe = (tf === '1s' || tf === '10s') ? tf : '1s'

    replayConfig = { symbol: replaySymbol, date, from, to, timeframe }
  }

  // Skip heavy server-side fetches in replay mode
  let activeGainers: Awaited<ReturnType<typeof getAllSessionMovers>>['cash'] = []
  let activeLosers: Awaited<ReturnType<typeof getAllSessionMovers>>['cash'] = []
  let currentSession: Awaited<ReturnType<typeof getAllSessionMovers>>['currentSession'] = 'closed'
  let initialGainerOHLC = null

  if (!replayConfig) {
    const [gainersResult, losersResult] = await Promise.all([
      getAllSessionMovers('gainers'),
      getAllSessionMovers('losers'),
    ])

    activeGainers = pickActiveMovers(gainersResult)
    activeLosers = pickActiveMovers(losersResult)
    currentSession = gainersResult.currentSession

    if (activeGainers.length > 0) {
      const result = await getStockIntradayOHLC(activeGainers[0].symbol)
      if (result.data) {
        initialGainerOHLC = result.data
      }
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="py-6 px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <LiveDashboard
          initialGainers={activeGainers}
          initialLosers={activeLosers}
          initialGainerOHLC={initialGainerOHLC}
          initialSession={currentSession}
          replayConfig={replayConfig}
        />
      </main>
    </div>
  )
}
