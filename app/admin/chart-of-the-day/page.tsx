import { ChartsPageContent } from '@/app/charts/page'
import { getDashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'

export const dynamic = 'force-dynamic'

export default async function AdminChartOfTheDayPage() {
  const setting = await getDashboardChartOfTheDaySetting()

  return (
    <ChartsPageContent
      chartOfDayEditor
      initialSpec={setting.chartSpec}
    />
  )
}
