import AppShell from '@/components/AppShell'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { loadDashboardChartOfTheDayPresentation } from '@/lib/dashboard/load-chart-of-the-day-presentation'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Provider requests include credentialed URLs. Dynamic rendering prevents
// static-build diagnostics from serializing those URLs.
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const [initialSnapshot, chartOfDayPresentation] = await Promise.all([
    fetchAllMarketData({ withProvenance: true }),
    loadDashboardChartOfTheDayPresentation(),
  ])
  const initialRenderedAt = new Date().toISOString()

  return (
    <AppShell showFooter>
      <MarketDashboardSunday
        initialData={initialSnapshot.data}
        initialCaptureTimes={initialSnapshot.captureTimes}
        chartOfDayPresentation={chartOfDayPresentation}
        initialRenderedAt={initialRenderedAt}
      />
    </AppShell>
  )
}
