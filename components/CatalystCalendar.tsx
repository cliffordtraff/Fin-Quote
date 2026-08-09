'use client'

import Link from 'next/link'
import { useState } from 'react'
import type {
  CatalystCalendarItem,
  CatalystCalendarModel,
  CatalystItemType,
  CatalystTypeFilter,
} from '@/lib/catalyst-calendar'

interface CatalystCalendarProps {
  model: CatalystCalendarModel
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

function typeLabel(type: CatalystItemType): string {
  return type === 'economic' ? 'Economic' : 'Earnings'
}

function timeLabel(item: CatalystCalendarItem): string {
  if (item.type === 'earnings') {
    if (item.timing === 'bmo') return 'Before open'
    if (item.timing === 'amc') return 'After close'
    if (item.timing === 'dmh') return 'Market hours'
    return 'Time TBD'
  }
  return timeFormatter.format(new Date(item.timestamp))
}

function FeedNotice({ model }: { model: CatalystCalendarModel }) {
  const unavailable = [
    model.feeds.economic.status === 'unavailable' ? 'economic releases' : null,
    model.feeds.earnings.status === 'unavailable' ? 'earnings' : null,
  ].filter((label): label is string => label !== null)

  if (unavailable.length === 0) return null

  const message = unavailable.length === 2
    ? 'Economic and earnings feeds are temporarily unavailable. Global market sessions are still available below.'
    : `${unavailable[0][0].toUpperCase()}${unavailable[0].slice(1)} are temporarily unavailable. Showing the feed that did load.`

  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:px-5"
    >
      {message}
    </div>
  )
}

function TruncationNotice({ model }: { model: CatalystCalendarModel }) {
  const messages: string[] = []
  if (model.feeds.economic.truncated) {
    const shown = model.items.filter((item) => item.type === 'economic').length
    messages.push(`first ${shown} of ${model.feeds.economic.totalCount} qualifying economic releases`)
  }
  if (model.feeds.earnings.truncated) {
    const shown = model.items.filter((item) => item.type === 'earnings').length
    messages.push(`first ${shown} of ${model.feeds.earnings.totalCount} qualifying earnings`)
  }
  if (messages.length === 0) return null

  return (
    <div
      role="status"
      className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200 sm:px-5"
    >
      This bounded view shows the {messages.join(' and the ')}. Refine by day or type to scan the loaded set.
    </div>
  )
}

function CatalystRow({ item, isNext }: { item: CatalystCalendarItem; isNext: boolean }) {
  const content = (
    <div className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[7.5rem_6rem_minmax(0,1fr)] sm:items-start sm:gap-3 sm:px-5">
      <time
        dateTime={new Date(item.timestamp).toISOString()}
        className="text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400"
      >
        {timeLabel(item)}
      </time>
      <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        item.type === 'economic'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
          : 'bg-sage-50 text-sage-700 dark:bg-sage-950/50 dark:text-sage-300'
      }`}>
        {typeLabel(item.type)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold leading-5 text-gray-950 dark:text-white">
            {item.title}
          </p>
          {isNext ? (
            <span className="rounded bg-sage-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sage-800 dark:bg-sage-900/60 dark:text-sage-200">
              Next
            </span>
          ) : null}
          {item.impact === 'high' ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              High impact
            </span>
          ) : item.impact === 'medium' ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Medium impact
            </span>
          ) : null}
        </div>
        {item.detail ? (
          <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {item.detail}
          </p>
        ) : null}
      </div>
    </div>
  )

  return item.href ? (
    <Link
      href={item.href}
      className="block rounded-md no-underline outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 dark:hover:bg-gray-800/60"
      aria-label={`${item.title}, ${timeLabel(item)}. Open stock page`}
    >
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  )
}

export default function CatalystCalendar({ model }: CatalystCalendarProps) {
  const [selectedDay, setSelectedDay] = useState(model.initialDay ?? 'week')
  const [selectedType, setSelectedType] = useState<CatalystTypeFilter>('all')

  const visibleItems = model.items.filter((item) => (
    (selectedDay === 'week' || item.dateKey === selectedDay) &&
    (selectedType === 'all' || item.type === selectedType)
  ))
  const visibleDateKeys = model.days
    .filter((day) => visibleItems.some((item) => item.dateKey === day.dateKey))
    .map((day) => day.dateKey)
  const firstUpcomingId = visibleItems.find(
    (item) => item.timestamp >= Date.parse(model.referenceTime),
  )?.id

  const countsByType: Record<CatalystTypeFilter, number> = {
    all: model.items.length,
    economic: model.items.filter((item) => item.type === 'economic').length,
    earnings: model.items.filter((item) => item.type === 'earnings').length,
  }
  const allFeedsUnavailable =
    model.feeds.economic.status === 'unavailable' &&
    model.feeds.earnings.status === 'unavailable'

  return (
    <section
      aria-labelledby="catalyst-calendar-heading"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="flex flex-col gap-2 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-700 dark:text-sage-300">
            Market catalysts
          </p>
          <h1 id="catalyst-calendar-heading" className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">
            Catalyst Calendar
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            US high- and medium-impact releases plus S&amp;P 500 earnings
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
          {model.rangeLabel} · New York time
        </p>
      </div>

      <FeedNotice model={model} />
      <TruncationNotice model={model} />

      {!allFeedsUnavailable ? (
        <div className="space-y-4 border-b border-gray-200 bg-gray-50/70 px-4 py-4 dark:border-gray-700 dark:bg-gray-950/30 sm:px-5">
          <div role="group" aria-label="Filter catalysts by day">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Day</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                aria-pressed={selectedDay === 'week'}
                onClick={() => setSelectedDay('week')}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
                  selectedDay === 'week'
                    ? 'border-sage-600 bg-sage-600 text-white dark:border-sage-400 dark:bg-sage-500 dark:text-gray-950'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-sage-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                Week <span className="ml-1 tabular-nums opacity-75">{model.items.length}</span>
              </button>
              {model.days.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  aria-pressed={selectedDay === day.dateKey}
                  aria-label={`${day.label}, ${day.count} ${day.count === 1 ? 'catalyst' : 'catalysts'}`}
                  onClick={() => setSelectedDay(day.dateKey)}
                  className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
                    selectedDay === day.dateKey
                      ? 'border-sage-600 bg-sage-600 text-white dark:border-sage-400 dark:bg-sage-500 dark:text-gray-950'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-sage-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                  }`}
                >
                  {day.shortLabel} <span className="ml-1 tabular-nums opacity-75">{day.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div role="group" aria-label="Filter catalysts by type">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Type</p>
            <div className="flex flex-wrap gap-2">
              {(['all', 'economic', 'earnings'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selectedType === type}
                  onClick={() => setSelectedType(type)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
                    selectedType === type
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  {type === 'all' ? 'All catalysts' : type} <span className="ml-1 tabular-nums opacity-70">{countsByType[type]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {visibleItems.length} {visibleItems.length === 1 ? 'catalyst' : 'catalysts'} shown
      </p>

      {allFeedsUnavailable ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Catalyst data is unavailable right now</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try this page again shortly.</p>
        </div>
      ) : model.items.length === 0 ? (
        <div role="status" className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">No scheduled catalysts this week</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The available feeds returned no qualifying US releases or S&amp;P 500 earnings.</p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div role="status" className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">No catalysts match these filters</p>
          <button
            type="button"
            onClick={() => {
              setSelectedDay('week')
              setSelectedType('all')
            }}
            className="mt-3 min-h-10 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:border-sage-500 hover:text-sage-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-600 dark:text-gray-200 dark:hover:text-sage-300"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {visibleDateKeys.map((dateKey) => {
            const day = model.days.find((candidate) => candidate.dateKey === dateKey)
            const items = visibleItems.filter((item) => item.dateKey === dateKey)
            if (!day) return null

            return (
              <section key={dateKey} aria-labelledby={`catalyst-day-${dateKey}`}>
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2 dark:bg-gray-800/70 sm:px-5">
                  <h2 id={`catalyst-day-${dateKey}`} className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                    {day.label}
                  </h2>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {items.length} {items.length === 1 ? 'catalyst' : 'catalysts'}
                  </span>
                </div>
                <ol className="divide-y divide-gray-100 px-0 dark:divide-gray-800">
                  {items.map((item) => (
                    <li key={item.id}>
                      <CatalystRow item={item} isNext={item.id === firstUpcomingId} />
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
