import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUserAdminContext } from '@/lib/auth/admin'

export const dynamic = 'force-dynamic'

const ADMIN_LINKS = [
  {
    href: '/admin/why-moved',
    title: 'Why This Stock Moved',
    description: "Approve, revise, or dismiss the catalysts attached to today's top movers.",
  },
  {
    href: '/admin/chart-of-the-day',
    title: 'Chart of the Day',
    description: 'Choose the dashboard chart that appears on the public homepage.',
  },
  {
    href: '/admin/review',
    title: 'Review Dashboard',
    description: 'Review query failures, categorize them, and leave notes.',
  },
  {
    href: '/admin/validation',
    title: 'Validation Dashboard',
    description: 'Inspect validation pass rates and auto-correction behavior.',
  },
  {
    href: '/admin/costs',
    title: 'Cost Dashboard',
    description: 'Track API spend and token usage across the app.',
  },
  {
    href: '/admin/evaluations',
    title: 'Evaluations',
    description: 'Inspect the latest tool-routing evaluation runs and annotations.',
  },
]

export default async function AdminHomePage() {
  const { user, isAdmin, adminConfigured } = await getCurrentUserAdminContext()

  if (!user) {
    redirect('/auth?redirect=/admin')
  }

  if (!isAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin</h1>
            <p className="mt-2 text-gray-600">
              Internal tools for editorial controls, QA, evaluations, and operations.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Back to Dashboard
          </Link>
        </div>

        {!adminConfigured ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            `ADMIN_EMAILS` is not configured yet. Admin routes currently fall back to any
            signed-in user.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {ADMIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sage-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-gray-900">{link.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
