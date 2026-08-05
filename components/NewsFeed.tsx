import type { NewsItem } from '@/app/actions/get-stock-news'
import { normalizeExternalHttpUrl } from '@/lib/safe-url'

interface NewsFeedProps {
  news: NewsItem[]
}

const INITIAL_STORY_COUNT = 8

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(' ', '')
}

function formatDateLabel(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

function prepareStories(news: NewsItem[]) {
  const seen = new Set<string>()
  return news.flatMap((item) => {
    const url = normalizeExternalHttpUrl(item.url)
    const title = item.title.trim()
    if (!url || !title) return []

    const dedupeKey = `${url}|${title.toLowerCase()}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [{ ...item, title, url }]
  })
}

function StoryList({ stories }: { stories: NewsItem[] }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/70">
      {stories.map((item) => (
        <a
          key={`${item.url}-${item.publishedDate}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="group grid min-w-0 gap-1.5 py-3 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4"
        >
          <time
            dateTime={item.publishedDate}
            className="text-xs tabular-nums text-gray-500 dark:text-gray-400"
          >
            {formatDateLabel(item.publishedDate)} · {formatTime(item.publishedDate)}
          </time>
          <span className="min-w-0 text-sm font-medium leading-5 text-gray-900 transition-colors group-hover:text-sage-700 dark:text-gray-100 dark:group-hover:text-sage-300">
            {item.title}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            {item.site || 'Source'} <span aria-hidden="true">↗</span>
          </span>
        </a>
      ))}
    </div>
  )
}

export default function NewsFeed({ news }: NewsFeedProps) {
  const stories = prepareStories(news || [])
  if (stories.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No recent company news is available.
      </div>
    )
  }

  const initialStories = stories.slice(0, INITIAL_STORY_COUNT)
  const remainingStories = stories.slice(INITIAL_STORY_COUNT)

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            Company coverage
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-950 dark:text-white">
            Latest news
          </h2>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      <StoryList stories={initialStories} />

      {remainingStories.length > 0 ? (
        <details className="group border-t border-gray-100 pt-2 dark:border-gray-700/70">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
            <span>Show {remainingStories.length} more stories</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ↓
            </span>
          </summary>
          <StoryList stories={remainingStories} />
        </details>
      ) : null}
    </div>
  )
}
