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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] pt-1 px-2 pb-1">
      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        Headlines
      </h3>
      <div className="space-y-0.5">
        {news.map((item, index) => (
          <a
            key={index}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1.5 group"
          >
            <span className="text-[10px] font-bold text-gray-700 dark:text-white w-7 flex-shrink-0">
              {getSiteAbbreviation(item.site)}
            </span>
            <span className="text-xs text-gray-700 dark:text-white w-16 flex-shrink-0">
              {formatPublishedDate(item.publishedDate)}
            </span>
            <span className="text-xs text-sky-600 dark:text-sky-400 group-hover:underline line-clamp-1">
              {item.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
