import type { MarketNewsItem } from '@/app/actions/get-market-news'

interface MarketHeadlinesProps {
  news: MarketNewsItem[]
}

// Map common news sites to short abbreviations
function getSiteAbbreviation(site: string): string {
  const siteMap: Record<string, string> = {
    'Reuters': 'R',
    'Bloomberg': 'B',
    'CNBC': 'CNBC',
    'Wall Street Journal': 'WSJ',
    'MarketWatch': 'MW',
    'Yahoo Finance': 'Y!',
    'Benzinga': 'BZ',
    'Seeking Alpha': 'SA',
    'Financial Times': 'FT',
    'Barrons': 'BR',
    'Investor\'s Business Daily': 'IBD',
    'The Motley Fool': 'MF',
    'CNN': 'CNN',
    'Fox Business': 'FOX',
    'AP': 'AP',
  }

  // Check for partial matches
  for (const [key, abbrev] of Object.entries(siteMap)) {
    if (site.toLowerCase().includes(key.toLowerCase())) {
      return abbrev
    }
  }

  // Default: first 2-3 characters
  return site.slice(0, 3).toUpperCase()
}

// Format the published date for display
function formatPublishedDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      // Show time for today's news
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).replace(' ', '')
    } else {
      // Show date for older news
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }
  } catch {
    return ''
  }
}

export default function MarketHeadlines({ news }: MarketHeadlinesProps) {
  if (!news || news.length === 0) {
    return null
  }

  return (
    <div className="h-[400px] overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex min-h-11 items-center border-b border-gray-200 px-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
          Headlines
        </h2>
      </div>
      <div className="h-[calc(400px-44px)] space-y-1 overflow-y-auto p-3">
        {news.map((item, index) => (
          <a
            key={index}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group grid grid-cols-[34px_54px_minmax(0,1fr)] items-start gap-2 rounded px-1 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="text-[10px] font-semibold text-gray-700 dark:text-white">
              {getSiteAbbreviation(item.site)}
            </span>
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {formatPublishedDate(item.publishedDate)}
            </span>
            <span className="line-clamp-2 text-xs leading-5 text-sky-700 group-hover:underline dark:text-sky-400">
              {item.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
