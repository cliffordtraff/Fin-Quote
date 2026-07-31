import type { Metadata } from 'next'

import AppShell from '@/components/AppShell'
import MorningBriefReport from '@/components/MorningBriefReport'
import { getMorningBriefReport } from '@/lib/morning-brief'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Morning Brief | The Intraday',
  description: 'The pre-market tape, scheduled catalysts, earnings, and ranked WIIM stories for today.',
}

export default async function MorningBriefPage() {
  const report = await getMorningBriefReport()

  return (
    <AppShell showFooter>
      <MorningBriefReport report={report} />
    </AppShell>
  )
}
