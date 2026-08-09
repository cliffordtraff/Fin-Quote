import type {
  StockCatalystHistoryItem,
  StockCatalystHistoryResult,
} from '@/lib/stock-catalyst-history'

interface StockCatalystHistoryProps {
  history: StockCatalystHistoryResult
}

interface AsyncStockCatalystHistoryProps {
  historyPromise: Promise<StockCatalystHistoryResult>
  currentSummaryText: string | null
}

const INITIAL_ITEM_COUNT = 3

const REASON_LABELS: Record<string, string> = {
  earnings: 'Earnings',
  analyst_action: 'Analyst action',
  macro: 'Macro',
  deal: 'Deal',
  product: 'Product',
  legal: 'Legal',
  capital_return: 'Capital return',
  management: 'Management',
  price_action: 'Price action',
  other: 'Company news',
  unclear: 'Market context',
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`))
}

function formatMove(value: number | null): string | null {
  if (value === null) return null
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function moveClass(value: number | null): string {
  if (value === null) return 'text-gray-500 dark:text-gray-400'
  return value >= 0
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-red-700 dark:text-red-400'
}

function CatalystHistoryItem({ item }: { item: StockCatalystHistoryItem }) {
  const move = formatMove(item.movePercent)
  const reason = item.reasonType
    ? (REASON_LABELS[item.reasonType] ?? 'Company catalyst')
    : 'Company catalyst'

  return (
    <article className="grid min-w-0 gap-3 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-5">
      <div>
        <time
          dateTime={item.summaryDate}
          className="block text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300"
        >
          {formatDate(item.summaryDate)}
        </time>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[10px] font-semibold text-sage-800 dark:bg-sage-950/50 dark:text-sage-300">
            {reason}
          </span>
          {move ? (
            <span className={`text-xs font-semibold tabular-nums ${moveClass(item.movePercent)}`}>
              {move}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm leading-6 text-gray-900 dark:text-gray-100">
          {item.summaryText}
        </p>
        {item.keyFact ? (
          <p className="mt-1.5 text-xs leading-5 text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              Key fact:
            </span>{' '}
            {item.keyFact}
          </p>
        ) : null}
        {item.source ? (
          <a
            href={item.source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900 dark:text-sage-300 dark:hover:text-sage-100"
          >
            <span className="truncate">
              {item.source.publisher
                ? `${item.source.publisher}: ${item.source.title}`
                : item.source.title}
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </article>
  )
}

function withoutCurrentSummary(
  history: StockCatalystHistoryResult,
  currentSummaryText: string | null,
): StockCatalystHistoryResult {
  if (history.status !== 'ready' || !currentSummaryText) return history

  const normalizedCurrentSummary = currentSummaryText.replace(/\s+/g, ' ').trim()
  const duplicateIndex = history.items.findIndex(
    (item) => item.summaryText === normalizedCurrentSummary,
  )
  if (duplicateIndex === -1) return history

  const items = [
    ...history.items.slice(0, duplicateIndex),
    ...history.items.slice(duplicateIndex + 1),
  ]
  return items.length > 0
    ? { status: 'ready', items }
    : { status: 'empty', items: [] }
}

export async function AsyncStockCatalystHistory({
  historyPromise,
  currentSummaryText,
}: AsyncStockCatalystHistoryProps) {
  const history = await historyPromise
  return (
    <StockCatalystHistory
      history={withoutCurrentSummary(history, currentSummaryText)}
    />
  )
}

export default function StockCatalystHistory({
  history,
}: StockCatalystHistoryProps) {
  if (history.status === 'empty') return null

  if (history.status === 'unavailable') {
    return (
      <section
        id="catalyst-history"
        aria-labelledby="catalyst-history-heading"
        className="bg-cream-100 dark:bg-gray-900"
      >
        <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-cream-300 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
            <h2
              id="catalyst-history-heading"
              className="text-sm font-semibold text-gray-950 dark:text-white"
            >
              Catalyst history
            </h2>
            <p role="status" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Recent catalyst history is temporarily unavailable. Price, filings, and news remain available.
            </p>
          </div>
        </div>
      </section>
    )
  }

  const initialItems = history.items.slice(0, INITIAL_ITEM_COUNT)
  const remainingItems = history.items.slice(INITIAL_ITEM_COUNT)

  return (
    <section
      id="catalyst-history"
      aria-labelledby="catalyst-history-heading"
      className="bg-cream-100 dark:bg-gray-900"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-2 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-800">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                Why it moved over time
              </p>
              <h2
                id="catalyst-history-heading"
                className="mt-1 text-base font-semibold text-gray-950 dark:text-white"
              >
                Catalyst history
              </h2>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {history.items.length} {history.items.length === 1 ? 'entry' : 'entries'}
            </span>
          </header>

          <div className="divide-y divide-gray-100 px-5 dark:divide-gray-700">
            {initialItems.map((item) => (
              <CatalystHistoryItem
                key={`${item.summaryDate}:${item.generatedAt}`}
                item={item}
              />
            ))}
          </div>

          {remainingItems.length > 0 ? (
            <details className="group border-t border-gray-100 dark:border-gray-700">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 text-xs font-semibold text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
                <span>Show {remainingItems.length} earlier catalysts</span>
                <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="divide-y divide-gray-100 border-t border-gray-100 px-5 dark:divide-gray-700 dark:border-gray-700">
                {remainingItems.map((item) => (
                  <CatalystHistoryItem
                    key={`${item.summaryDate}:${item.generatedAt}`}
                    item={item}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  )
}
