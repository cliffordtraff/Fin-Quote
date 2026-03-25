interface StockWhyMovingBannerProps {
  whyMoving:
    | {
        status: 'found' | 'not_found' | 'error'
        displayText: string | null
      }
    | null
}

export default function StockWhyMovingBanner({
  whyMoving,
}: StockWhyMovingBannerProps) {
  if (!whyMoving || whyMoving.status !== 'found' || !whyMoving.displayText) {
    return null
  }

  return (
    <div className="mb-4 rounded-lg border border-sage-200 bg-cream-50 px-4 py-3 dark:border-sage-900/50 dark:bg-gray-900/60">
      <div className="flex flex-col gap-1">
        <p className="text-sm leading-6 text-gray-800 dark:text-gray-200">
          {whyMoving.displayText}
        </p>
      </div>
    </div>
  )
}
