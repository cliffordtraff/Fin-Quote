import NewsletterDraftCreate from '../NewsletterDraftCreate'

export default async function NewsletterDraftCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>
}) {
  const { format } = await searchParams
  const defaultFormat = format === 'market_roundup' ? 'market_roundup' : 'single_stock'
  return (
    <div className="min-h-screen bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <NewsletterDraftCreate defaultFormat={defaultFormat} />
      </div>
    </div>
  )
}
