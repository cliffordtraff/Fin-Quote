import AppShell from '@/components/AppShell'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { loadDashboardChartOfTheDayPresentation } from '@/lib/dashboard/load-chart-of-the-day-presentation'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Provider requests include credentialed URLs. Dynamic rendering prevents
// static-build diagnostics from serializing those URLs.
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const initialRenderedAt = new Date().toISOString()
  const [initialData, chartOfDayPresentation] = await Promise.all([
    fetchAllMarketData(),
    loadDashboardChartOfTheDayPresentation(),
  ])

  return (
    <AppShell showFooter>
      <MarketDashboardSunday
        initialData={initialData}
        chartOfDayPresentation={chartOfDayPresentation}
        initialRenderedAt={initialRenderedAt}
      />
    </AppShell>
  )
}
