'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function NewsletterError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      title="Newsletter workspace could not finish loading"
      description="No draft or publication state was changed. Retry the workspace, or return to the dashboard and reopen it when the service recovers."
    />
  )
}
