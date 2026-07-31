import AppShell from '@/components/AppShell'
import InsidersPageClient from '@/components/InsidersPageClient'
import { getLatestInsiderTrades } from '@/app/actions/insider-trading'

export const dynamic = 'force-dynamic'

export default async function InsidersPage() {
  const result = await getLatestInsiderTrades(200)
  const initialTrades = 'trades' in result ? result.trades : []

  return (
    <AppShell mainClassName="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-950 dark:text-white">
        Insider Trading
      </h1>
      <InsidersPageClient initialTrades={initialTrades} />
    </AppShell>
  )
}
