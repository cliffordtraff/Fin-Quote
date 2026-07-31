import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import NewsletterMorningReview from '@/components/newsletter/NewsletterMorningReview'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Morning Newsletter Report | The Intraday',
  description:
    'The completed pre-market WIIM report with original summaries, charts, and email-ready newsletters.',
}

export default function NewsletterMorningReviewPage() {
  return (
    <AppShell>
      <NewsletterMorningReview />
    </AppShell>
  )
}
