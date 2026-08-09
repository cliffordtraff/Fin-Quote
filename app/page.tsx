import LandingPage from '@/components/landing'
import Navigation from '@/components/Navigation'
import DashboardFooter from '@/components/DashboardFooter'
import MarketDashboardSunday from '@/components/MarketDashboardSunday'
import { loadDashboardChartOfTheDayPresentation } from '@/lib/dashboard/load-chart-of-the-day-presentation'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import { redirect } from 'next/navigation'
import { getNewsletterAutomationClock } from '@/lib/newsletter/automation-clock'
import { hasFinishedNewsletterMorningReport } from '@/lib/newsletter/morning-report-readiness'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (process.env.NEXT_PUBLIC_ENABLE_LANDING === 'true') {
    return <LandingPage />
  }

  const clock = getNewsletterAutomationClock()
  if (
    clock.isMorningReportWindow &&
    (await hasFinishedNewsletterMorningReport(clock.marketDate))
  ) {
    redirect('/newsletter/morning-review')
  }

  const [initialSnapshot, chartOfDayPresentation] = await Promise.all([
    fetchAllMarketData({ withProvenance: true }),
    loadDashboardChartOfTheDayPresentation(),
  ])
  const initialRenderedAt = new Date().toISOString()

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-gray-900 flex flex-col">
      <Navigation />
      <main className="flex-1 py-4">
        <MarketDashboardSunday
          initialData={initialSnapshot.data}
          initialCaptureTimes={initialSnapshot.captureTimes}
          chartOfDayPresentation={chartOfDayPresentation}
          initialRenderedAt={initialRenderedAt}
        />
      </main>
      <DashboardFooter />
    </div>
  )
}
