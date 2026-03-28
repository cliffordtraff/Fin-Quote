import AdminChartOfTheDayEditor from '@/components/AdminChartOfTheDayEditor'
import { getDashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'

export const dynamic = 'force-dynamic'

export default async function AdminChartOfTheDayPage() {
  const setting = await getDashboardChartOfTheDaySetting()

  return <AdminChartOfTheDayEditor initialSpec={setting.chartSpec} />
}
