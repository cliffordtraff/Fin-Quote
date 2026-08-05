import AdminChartOfTheDayEditor from '@/components/AdminChartOfTheDayEditor'
import { redirect } from 'next/navigation'
import { getCurrentUserAdminContext } from '@/lib/auth/admin'
import { getDashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'

export const dynamic = 'force-dynamic'

export default async function AdminChartOfTheDayPage() {
  const { user, isAdmin } = await getCurrentUserAdminContext()
  if (!user) {
    redirect('/auth?redirect=/admin/chart-of-the-day')
  }
  if (!isAdmin) {
    redirect('/dashboard')
  }

  const setting = await getDashboardChartOfTheDaySetting()

  return <AdminChartOfTheDayEditor initialSpec={setting.chartSpec} />
}
