import type { EarningsData } from '@/app/actions/earnings-calendar'
import type { MarketNewsItem } from '@/app/actions/get-market-news'

interface EconomicEvent {
  date: string
  event: string
  previous: number | null
  estimate: number | null
  actual: number | null
  impact: string
  unit: string
}

interface CatalystTimelineProps {
  economicEvents: EconomicEvent[]
  earnings: EarningsData[]
  news: MarketNewsItem[]
  referenceTime: string
}

interface CatalystItem {
  id: string
  timestamp: number
  type: 'Economic' | 'Earnings' | 'Headline'
  title: string
  detail: string | null
  impact: 'high' | 'normal'
  href: string | null
}

const INITIAL_ITEM_COUNT = 6

function earningsTimestamp(earning: EarningsData): number {
  const hour = earning.time === 'bmo' ? 8 : earning.time === 'amc' ? 16 : 12
  return new Date(`${earning.date}T${String(hour).padStart(2, '0')}:00:00-04:00`).getTime()
}

function formatEconomicDetail(event: EconomicEvent): string | null {
  const parts = [
    event.previous !== null ? `Prev ${event.previous}${event.unit}` : null,
    event.estimate !== null ? `Est ${event.estimate}${event.unit}` : null,
    event.actual !== null ? `Actual ${event.actual}${event.unit}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

function buildCatalystItems(
  economicEvents: EconomicEvent[],
  earnings: EarningsData[],
  news: MarketNewsItem[],
  referenceTimestamp: number,
): CatalystItem[] {
  const items: CatalystItem[] = [
    ...economicEvents.map((event, index) => ({
      id: `economic-${event.date}-${index}`,
      timestamp: new Date(event.date).getTime(),
      type: 'Economic' as const,
      title: event.event,
      detail: formatEconomicDetail(event),
      impact: event.impact === 'High' ? 'high' as const : 'normal' as const,
      href: null,
    })),
    ...earnings.map((earning, index) => ({
      id: `earnings-${earning.symbol}-${earning.date}-${index}`,
      timestamp: earningsTimestamp(earning),
      type: 'Earnings' as const,
      title: `${earning.symbol} · ${earning.name}`,
      detail:
        earning.time === 'bmo'
          ? 'Before open'
          : earning.time === 'amc'
            ? 'After close'
            : earning.time === 'dmh'
              ? 'During market hours'
              : 'Time TBD',
      impact: 'normal' as const,
      href: `/stock/${encodeURIComponent(earning.symbol)}`,
    })),
    ...news.map((item, index) => ({
      id: `headline-${item.publishedDate}-${index}`,
      timestamp: new Date(item.publishedDate).getTime(),
      type: 'Headline' as const,
      title: item.title,
      detail: item.site || null,
      impact: 'normal' as const,
      href: item.url,
    })),
  ].filter((item) => Number.isFinite(item.timestamp))

  return items.sort((left, right) => {
    const leftFuture = left.timestamp >= referenceTimestamp
    const rightFuture = right.timestamp >= referenceTimestamp
    if (leftFuture !== rightFuture) return leftFuture ? -1 : 1
    return leftFuture
      ? left.timestamp - right.timestamp
      : right.timestamp - left.timestamp
  })
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(timestamp))
}

function CatalystRow({ item, emphasized }: { item: CatalystItem; emphasized: boolean }) {
  const content = (
    <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[7rem_5rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <time className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {formatTime(item.timestamp)}
      </time>
      <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        item.type === 'Economic'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          : item.type === 'Earnings'
            ? 'bg-sage-50 text-sage-700 dark:bg-sage-950/40 dark:text-sage-300'
            : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
      }`}>
        {item.type}
      </span>
      <div className="min-w-0">
        <p className={`${emphasized ? 'font-semibold text-gray-950 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'} text-sm leading-5`}>
          {item.title}
          {item.impact === 'high' ? (
            <span className="ml-2 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
              High impact
            </span>
          ) : null}
        </p>
        {item.detail ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {item.detail}
          </p>
        ) : null}
      </div>
    </div>
  )

  return item.href ? (
    <a
      href={item.href}
      target={item.type === 'Headline' ? '_blank' : undefined}
      rel={item.type === 'Headline' ? 'noopener noreferrer' : undefined}
      className="block no-underline hover:bg-gray-50 dark:hover:bg-gray-800/60"
    >
      {content}
    </a>
  ) : content
}

export default function CatalystTimeline({
  economicEvents,
  earnings,
  news,
  referenceTime,
}: CatalystTimelineProps) {
  const items = buildCatalystItems(
    economicEvents,
    earnings,
    news,
    new Date(referenceTime).getTime(),
  )
  const initialItems = items.slice(0, INITIAL_ITEM_COUNT)
  const remainingItems = items.slice(INITIAL_ITEM_COUNT)

  if (items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-11 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
        <div>
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Next up</h2>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Economic releases, earnings, and market headlines
          </p>
        </div>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {items.length} catalysts
        </span>
      </div>
      <div className="divide-y divide-gray-100 px-4 dark:divide-gray-800">
        {initialItems.map((item, index) => (
          <CatalystRow key={item.id} item={item} emphasized={index === 0} />
        ))}
      </div>
      {remainingItems.length > 0 ? (
        <details className="group border-t border-gray-100 dark:border-gray-800">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-4 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            <span>Show {remainingItems.length} more</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">↓</span>
          </summary>
          <div className="divide-y divide-gray-100 border-t border-gray-100 px-4 dark:divide-gray-800 dark:border-gray-800">
            {remainingItems.map((item) => (
              <CatalystRow key={item.id} item={item} emphasized={false} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

export { buildCatalystItems }
