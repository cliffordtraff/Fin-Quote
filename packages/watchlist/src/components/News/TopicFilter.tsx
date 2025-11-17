'use client'

import { TOPICS, Topic } from '@watchlist/config/topics'

interface TopicFilterProps {
  selectedTopics: Topic[]
  onTopicToggle: (topic: Topic) => void
  topicCounts?: Record<string, number>
  totalCount: number
}

export default function TopicFilter({
  selectedTopics,
  onTopicToggle,
  topicCounts = {},
  totalCount
}: TopicFilterProps) {
  const isSelected = (topic: Topic) => selectedTopics.includes(topic)

  const handleKeyDown = (e: React.KeyboardEvent, topic: Topic) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTopicToggle(topic)
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Filter by Topic:
        </h2>
        {selectedTopics.length > 0 && (
          <button
            onClick={() => selectedTopics.forEach(t => onTopicToggle(t))}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            aria-label="Clear all topic filters"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* All filter */}
        <button
          onClick={() => selectedTopics.forEach(t => onTopicToggle(t))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              selectedTopics.forEach(t => onTopicToggle(t))
            }
          }}
          className={`
            px-3 py-1.5 rounded-full text-sm font-medium
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
            ${selectedTopics.length === 0
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }
          `}
          tabIndex={0}
          role="checkbox"
          aria-checked={selectedTopics.length === 0}
          aria-label={`Show all articles (${totalCount})`}
        >
          All ({totalCount})
        </button>

        {/* Topic filters */}
        {TOPICS.map((topic) => {
          const count = topicCounts[topic] || 0
          const selected = isSelected(topic)

          return (
            <button
              key={topic}
              onClick={() => onTopicToggle(topic)}
              onKeyDown={(e) => handleKeyDown(e, topic)}
              disabled={count === 0}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                ${selected
                  ? 'bg-blue-600 text-white'
                  : count === 0
                    ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
              tabIndex={count === 0 ? -1 : 0}
              role="checkbox"
              aria-checked={selected}
              aria-label={`Filter by ${topic} (${count} articles)`}
            >
              {topic} ({count})
            </button>
          )
        })}
      </div>

      {selectedTopics.length > 0 && (
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Showing articles tagged: <span className="font-medium">{selectedTopics.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
