import type { NewsItem } from '@/app/actions/get-stock-news';

interface NewsFeedProps {
  news: NewsItem[];
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(' ', '');
}

function formatDateLabel(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function getDateKey(dateString: string): string {
  const date = new Date(dateString);
  return date.toDateString();
}

export default function NewsFeed({ news }: NewsFeedProps) {
  if (!news || news.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No recent news available.
      </div>
    );
  }

  // Group news by date
  const groupedNews: { [key: string]: { label: string; items: NewsItem[] } } = {};

  news.forEach((item) => {
    const dateKey = getDateKey(item.publishedDate);
    if (!groupedNews[dateKey]) {
      groupedNews[dateKey] = {
        label: formatDateLabel(item.publishedDate),
        items: [],
      };
    }
    groupedNews[dateKey].items.push(item);
  });

  return (
    <div className="space-y-1">
      {Object.entries(groupedNews).map(([dateKey, group]) => (
        <div key={dateKey}>
          {group.items.map((item, index) => (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline py-0.5 group"
            >
              <span className="flex-shrink-0 w-20 text-xs text-gray-500 dark:text-gray-400 text-right pr-2">
                {index === 0 ? group.label : ''}
              </span>
              <span className="flex-shrink-0 w-16 text-xs text-gray-500 dark:text-gray-400">
                {formatTime(item.publishedDate)}
              </span>
              <span className="text-sm text-blue-600 dark:text-blue-400 group-hover:underline truncate">
                {item.title}
              </span>
              <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 ml-1">
                ({item.site})
              </span>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
