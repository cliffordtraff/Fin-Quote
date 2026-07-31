import AppShell from '@/components/AppShell'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { loadDashboardChartOfTheDayEmbedSpec } from '@/lib/dashboard/chart-of-the-day'
import { fetchAllMarketData } from '@/lib/fetch-market-data'

// Provider requests include credentialed URLs. Dynamic rendering prevents
// static-build diagnostics from serializing those URLs.
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const [initialData, chartOfDaySpec] = await Promise.all([
    fetchAllMarketData(),
    loadDashboardChartOfTheDayEmbedSpec(),
  ])

  return (
    <AppShell showFooter>
      <MarketDashboardSunday
        initialData={initialData}
        chartOfDaySpec={chartOfDaySpec}
      />
    </AppShell>
  )
}
