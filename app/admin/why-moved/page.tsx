import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAllSessionMovers } from '@/app/actions/market-movers'
import WhyMovedReviewQueue from '@/components/WhyMovedReviewQueue'
import { getCurrentUserAdminContext } from '@/lib/auth/admin'
import { getTradingDate } from '@/lib/market-hours'
import { listNewsletterDrafts } from '@/lib/newsletter/drafts'
import {
  loadWhyMovedReviewQueue,
  selectWhyMovedCandidates,
} from '@/lib/why-moved-review'

export const dynamic = 'force-dynamic'

export default async function WhyMovedReviewPage() {
  const { user, isAdmin, adminConfigured } =
    await getCurrentUserAdminContext()

  if (!user) {
    redirect('/auth?redirect=/admin/why-moved')
  }
  if (!isAdmin) {
    redirect('/dashboard/pulse-today')
  }

  const marketDate = getTradingDate()
  const [gainers, losers] = await Promise.all([
    getAllSessionMovers('gainers'),
    getAllSessionMovers('losers'),
  ])
  const candidates = selectWhyMovedCandidates(
    gainers,
    losers,
    marketDate,
  )
  const [reviewQueue, newsletterDrafts] = await Promise.all([
    loadWhyMovedReviewQueue(candidates),
    listNewsletterDrafts({
      ownerId: user.id,
      sessionId: `admin-${user.id}`,
    }),
  ])
  const draftsByReviewKey = new Map(
    newsletterDrafts
      .filter((draft) => draft.sourceReviewKey)
      .map((draft) => [draft.sourceReviewKey, draft]),
  )
  const queue = reviewQueue.map((item) => {
    const draft = draftsByReviewKey.get(item.reviewKey)
    return {
      ...item,
      newsletterDraft: draft
        ? {
            id: draft.id,
            status: draft.status,
            subjectLine: draft.subjectLine,
            chartsAttached: draft.attachedChartCount,
            beehiivUrl: draft.beehiivUrl,
          }
        : null,
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-700">
              Editorial operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-950">
              Why This Stock Moved
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review the catalyst attached to today&apos;s highest-priority movers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/newsletter/editor"
              className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-2 text-sm font-semibold text-sage-800 transition hover:border-sage-500"
            >
              Newsletter History
            </Link>
            <Link
              href="/dashboard/pulse-today"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
            >
              Pulse Today
            </Link>
            <Link
              href="/admin"
              className="rounded-lg bg-sage-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-6">
        {!adminConfigured ? (
          <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Admin allowlist is not configured. Access currently falls back to any
            signed-in user.
          </div>
        ) : null}
        <WhyMovedReviewQueue
          initialItems={queue}
          marketDate={marketDate}
        />
      </main>
    </div>
  )
}
