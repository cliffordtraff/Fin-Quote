import NewsletterChartLibraryHome from './NewsletterChartLibraryHome'
import { getDefaultPublicChartingBaseUrl } from '@/lib/newsletter/charting-platform-export'

export default function NewsletterChartsPage() {
  const chartBuilderUrl = new URL(
    '/tos/AAPL?view=price',
    `${getDefaultPublicChartingBaseUrl()}/`,
  ).toString()

  return (
    <div className="min-h-screen bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <NewsletterChartLibraryHome chartBuilderUrl={chartBuilderUrl} />
      </div>
    </div>
  )
}
