'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopicFilter from '@watchlist/components/News/TopicFilter'
import TopicBadge from '@watchlist/components/News/TopicBadge'
import { Topic, TOPICS } from '@watchlist/config/topics'

interface NewsArticle {
  headline: string
  description: string
  canonicalUrl: string
  source: string
  publishedAt: string
  author?: string
  isArchived?: boolean
  topics?: Topic[]
  feedTopic?: string
  topicsClassified?: boolean
}

export default function NewsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([])
  const [classifying, setClassifying] = useState(false)

  // Initialize filters from query string
  useEffect(() => {
    if (!searchParams) return

    const sourceParam = searchParams.get('source')
    if (sourceParam && ['all', 'WSJ', 'NYT', 'Bloomberg', 'FMP'].includes(sourceParam)) {
      setSelectedSource(sourceParam)
    }

    const topicsParam = searchParams.get('topics')
    if (topicsParam) {
      const topics = topicsParam
        .split(',')
        .map((topic) => topic.trim())
        .filter((topic): topic is Topic => TOPICS.includes(topic as Topic))
      setSelectedTopics(topics)
    }
  }, [searchParams])

  const fetchArticles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/news/all', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setArticles(Array.isArray(data.articles) ? data.articles : [])
        setLastUpdated(new Date())
      } else {
        console.error('Failed to load news center articles', await response.text())
        setArticles([])
      }
    } catch (error) {
      console.error('Error fetching news center articles', error)
      setArticles([])
    } finally {
      setLoading(false)
    }
  }

  const classifyArticles = async () => {
    try {
      setClassifying(true)

      const batchSize = 25
      const unclassified = articles.filter((article) => !article.topicsClassified)
      let allResults: Array<{ canonicalUrl: string; topics: Topic[] }> = []

      for (let i = 0; i < unclassified.length; i += batchSize) {
        const batch = unclassified.slice(i, i + batchSize)
        const response = await fetch('/api/news/classify-simple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articles: batch })
        })

        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data.results)) {
            allResults = [...allResults, ...data.results]
          }
        } else {
          console.error('Classification batch failed', await response.text())
        }
      }

      if (allResults.length > 0) {
        setArticles((prev) =>
          prev.map((article) => {
            const classified = allResults.find((item) => item.canonicalUrl === article.canonicalUrl)
            if (classified) {
              return {
                ...article,
                topics: classified.topics,
                topicsClassified: true
              }
            }
            return article
          })
        )
      }
    } catch (error) {
      console.error('Error classifying articles', error)
    } finally {
      setClassifying(false)
    }
  }

  useEffect(() => {
    fetchArticles()
    const interval = setInterval(fetchArticles, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unclassified = articles.filter((article) => !article.topicsClassified)
    if (unclassified.length > 0 && !classifying && !loading) {
      classifyArticles()
    }
  }, [articles, classifying, loading])

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 24 && date.toDateString() === now.toDateString()) {
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      if (diffMins < 1) return `${timeStr} (just now)`
      if (diffMins < 60) return `${timeStr} (${diffMins}m ago)`
      return timeStr
    }

    if (diffDays === 1) {
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      return `Yesterday at ${timeStr}`
    }

    if (diffDays < 7) {
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' })
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      return `${dayStr} at ${timeStr}`
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined
    })
  }

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'WSJ':
        return '#d93025'
      case 'NYT':
        return '#1a73e8'
      case 'Bloomberg':
        return '#7952b3'
      default:
        return '#1a73e8'
    }
  }

  const updateURL = (source: string, topics: Topic[]) => {
    const params = new URLSearchParams()
    if (source !== 'all') params.set('source', source)
    if (topics.length > 0) params.set('topics', topics.join(','))
    const query = params.toString()
    router.replace(query ? `/news?${query}` : '/news', { scroll: false })
  }

  const handleSourceChange = (source: string) => {
    setSelectedSource(source)
    updateURL(source, selectedTopics)
  }

  const handleTopicToggle = (topic: Topic) => {
    const newTopics = selectedTopics.includes(topic)
      ? selectedTopics.filter((t) => t !== topic)
      : [...selectedTopics, topic]

    setSelectedTopics(newTopics)
    updateURL(selectedSource, newTopics)
  }

  const handleTopicClick = (topic: Topic) => {
    if (!selectedTopics.includes(topic)) {
      const newTopics = [topic]
      setSelectedTopics(newTopics)
      updateURL(selectedSource, newTopics)
    }
  }

  const filteredBySource = useMemo(
    () => articles.filter((article) => selectedSource === 'all' || article.source === selectedSource),
    [articles, selectedSource]
  )

  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredBySource.forEach((article) => {
      const topics = new Set<Topic>()
      article.topics?.forEach((topic) => topics.add(topic))
      if (article.feedTopic && TOPICS.includes(article.feedTopic as Topic)) {
        topics.add(article.feedTopic as Topic)
      }
      topics.forEach((topic) => {
        counts[topic] = (counts[topic] || 0) + 1
      })
    })
    return counts
  }, [filteredBySource])

  const filteredArticles = useMemo(() => {
    if (selectedTopics.length === 0) return filteredBySource

    return filteredBySource.filter((article) => {
      const topics = new Set<Topic>()
      article.topics?.forEach((topic) => topics.add(topic))
      if (article.feedTopic && TOPICS.includes(article.feedTopic as Topic)) {
        topics.add(article.feedTopic as Topic)
      }
      if (topics.size === 0) return false
      return selectedTopics.some((topic) => topics.has(topic))
    })
  }, [filteredBySource, selectedTopics])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'rgb(var(--watchlist-bg))', padding: '10px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            backgroundColor: 'rgb(var(--watchlist-surface))',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '16px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgb(var(--watchlist-border))'
            }}
          >
            <span style={{ fontSize: '16px', fontWeight: '500', color: 'rgb(var(--watchlist-text-secondary))' }}>
              Filter by source:
            </span>
            {['all', 'WSJ', 'NYT', 'Bloomberg'].map((source) => (
              <button
                key={source}
                onClick={() => handleSourceChange(source)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '20px',
                  border: selectedSource === source ? 'none' : '1px solid rgb(var(--watchlist-border))',
                  backgroundColor:
                    selectedSource === source
                      ? source === 'all'
                        ? '#1a73e8'
                        : getSourceColor(source)
                      : 'rgb(var(--watchlist-button-bg))',
                  color: selectedSource === source ? 'white' : 'rgb(var(--watchlist-text-primary))',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: selectedSource === source ? '600' : '400',
                  transition: 'all 0.2s'
                }}
              >
                {source === 'all' ? 'All Sources' : source}
              </button>
            ))}
          </div>

          <TopicFilter
            selectedTopics={selectedTopics}
            onTopicToggle={handleTopicToggle}
            topicCounts={topicCounts}
            totalCount={filteredBySource.length}
          />

          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid rgb(var(--watchlist-border))',
              display: 'flex',
              gap: '15px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ fontSize: '15px', color: 'rgb(var(--watchlist-text-muted))' }}>
              {filteredArticles.length} articles • Last updated {formatTimeAgo(lastUpdated.toISOString())}
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={fetchArticles}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgb(var(--watchlist-button-bg))',
                  color: 'rgb(var(--watchlist-text-primary))',
                  border: '1px solid rgb(var(--watchlist-button-border))',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '15px'
                }}
              >
                Refresh
              </button>
              <button
                onClick={() => router.push('/watchlist')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '15px'
                }}
              >
                Back to Watchlist
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'rgb(var(--watchlist-surface))',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}
        >
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'rgb(var(--watchlist-text-secondary))' }}>
              <div style={{ fontSize: '18px', marginBottom: '12px' }}>Loading articles...</div>
              <div
                style={{
                  display: 'inline-block',
                  width: '40px',
                  height: '40px',
                  border: '3px solid #f3f3f3',
                  borderTop: '3px solid #1a73e8',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'rgb(var(--watchlist-text-muted))', fontSize: '18px' }}>
              No articles available
            </div>
          ) : (
            filteredArticles.map((article, index) => (
              <div
                key={`${article.canonicalUrl}-${index}`}
                style={{
                  padding: '20px',
                  borderBottom: index < filteredArticles.length - 1 ? '1px solid rgb(var(--watchlist-border))' : 'none',
                  cursor: 'pointer',
                  backgroundColor: 'rgb(var(--watchlist-surface))'
                }}
                onClick={() => article.canonicalUrl && window.open(article.canonicalUrl, '_blank')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: getSourceColor(article.source),
                      padding: '5px 12px',
                      borderRadius: '3px'
                    }}
                  >
                    {article.source}
                  </span>
                  {article.isArchived && (
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#7c3aed',
                        backgroundColor: 'rgba(124,58,237,0.1)',
                        padding: '4px 10px',
                        borderRadius: '3px'
                      }}
                    >
                      Archived
                    </span>
                  )}
                  <span style={{ fontSize: '15px', color: 'rgb(var(--watchlist-text-muted))' }}>
                    {formatTimeAgo(article.publishedAt)}
                  </span>
                  {article.author && (
                    <span style={{ fontSize: '15px', color: 'rgb(var(--watchlist-text-secondary))' }}>
                      by {article.author}
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    margin: '0 0 10px 0',
                    fontSize: '20px',
                    fontWeight: '500',
                    color: '#60a5fa',
                    lineHeight: '1.4'
                  }}
                >
                  {article.headline}
                </h3>

                {article.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '16px',
                      color: 'rgb(var(--watchlist-text-primary))',
                      lineHeight: '1.6',
                      maxWidth: '900px'
                    }}
                  >
                    {article.description}
                  </p>
                )}

                {(() => {
                  const displayTopics =
                    article.topics && article.topics.length > 0
                      ? article.topics
                      : article.feedTopic && TOPICS.includes(article.feedTopic as Topic)
                        ? [article.feedTopic as Topic]
                        : []

                  return displayTopics.length > 0 ? (
                    <div style={{ marginTop: '12px' }}>
                      <TopicBadge topics={displayTopics} onTopicClick={handleTopicClick} size="sm" />
                    </div>
                  ) : null
                })()}

                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '14px',
                    color: 'rgb(var(--watchlist-text-muted))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  Click to read full article →
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && articles.length > 0 && (
          <div style={{ marginTop: '20px', textAlign: 'center', color: 'rgb(var(--watchlist-text-secondary))', fontSize: '16px' }}>
            Showing {filteredArticles.length} articles • Auto-refreshes every 10 minutes
          </div>
        )}
      </div>
    </div>
  )
}
