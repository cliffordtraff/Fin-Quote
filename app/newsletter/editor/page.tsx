import { Suspense } from 'react'
import NewsletterDraftsHome from './NewsletterDraftsHome'

export default function NewsletterEditorPage() {
  return (
    <div className="min-h-screen bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-gray-300 bg-white p-6 text-sm text-gray-500 shadow-sm">
              Loading newsletter history…
            </div>
          }
        >
          <NewsletterDraftsHome />
        </Suspense>
      </div>
    </div>
  )
}
