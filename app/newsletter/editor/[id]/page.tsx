import NewsletterDraftEditor from './NewsletterDraftEditor'

export default async function NewsletterDraftEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="min-h-screen bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <NewsletterDraftEditor draftId={id} />
      </div>
    </div>
  )
}
