'use client'

import RouteErrorState from '@/components/RouteErrorState'

export default function StockError({
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
      title="This stock page could not finish loading"
      description="The market-data request did not complete. Retry now, or return to the dashboard while the provider recovers."
    />
  )
}
