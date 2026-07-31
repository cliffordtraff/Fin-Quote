import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import NewsletterOperations from '@/components/newsletter/NewsletterOperations'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Newsletter Operations | The Intraday',
  description: 'Daily newsletter pipeline health and delivery operations.',
}

export default function NewsletterOperationsPage() {
  return (
    <AppShell>
      <NewsletterOperations />
    </AppShell>
  )
}
