import type { Metadata } from 'next'

import AppShell from '@/components/AppShell'
import MidMorningBriefReport from '@/components/MidMorningBriefReport'
import { getMidMorningBriefReport } from '@/lib/mid-morning-brief'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mid-Morning Brief | The Intraday',
  description: 'The opening tape, changes from the morning report, live leaders, and the remaining trading-day catalysts.',
}

export default async function MidMorningBriefPage() {
  const report = await getMidMorningBriefReport()

  return (
    <AppShell showFooter>
      <MidMorningBriefReport report={report} />
    </AppShell>
  )
}
