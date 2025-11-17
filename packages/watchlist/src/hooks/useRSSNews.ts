import { useState, useEffect, useCallback, useRef } from 'react'
import { debounce } from 'lodash'
import { NewsArticle } from '@watchlist/types'

interface RSSNewsMeta {
  symbol: string
  articles: NewsArticle[]
  count: number
  latestArticle?: NewsArticle
}

interface UseRSSNewsOptions {
  visibleSymbols: string[]
  enabled?: boolean
}

// Cache RSS news data with 15-minute TTL
const CACHE_KEY_PREFIX = 'rss_news_'
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function getCachedRSSNews(symbol: string): RSSNewsMeta | null {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${symbol}`)
    if (!cached) return null

    const data = JSON.parse(cached)
    const age = Date.now() - data.timestamp

    if (age > CACHE_TTL) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${symbol}`)
      return null
    }

    return data.meta
  } catch {
    return null
  }
}

function setCachedRSSNews(symbol: string, meta: RSSNewsMeta) {
  try {
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${symbol}`,
      JSON.stringify({
        meta,
        timestamp: Date.now()
      })
    )
  } catch (error) {
    console.warn('Failed to cache RSS news:', error)
  }
}

export function useRSSNews({ visibleSymbols, enabled = true }: UseRSSNewsOptions) {
  const [rssNewsData, setRSSNewsData] = useState<Record<string, RSSNewsMeta>>({})
  const [loading, setLoading] = useState(false)
  const fetchInProgress = useRef(false)
  const lastFetchedSymbols = useRef<string[]>([])

  // Load cached data on mount
  useEffect(() => {
    const cachedData: Record<string, RSSNewsMeta> = {}

    // Load all cached RSS news from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        const symbol = key.replace(CACHE_KEY_PREFIX, '')
        const cached = getCachedRSSNews(symbol)
        if (cached) {
          cachedData[symbol] = cached
        }
      }
    }

    if (Object.keys(cachedData).length > 0) {
      setRSSNewsData(cachedData)
    }
  }, [])

  // Debounced fetch function for RSS news
  const fetchRSSNews = useCallback(
    debounce(async (symbols: string[]) => {
      if (!enabled || fetchInProgress.current || symbols.length === 0) return

      // Check if we're fetching the same symbols
      const symbolsStr = symbols.sort().join(',')
      const lastSymbolsStr = lastFetchedSymbols.current.sort().join(',')
      if (symbolsStr === lastSymbolsStr) {
        return
      }

      fetchInProgress.current = true
      lastFetchedSymbols.current = symbols
      setLoading(true)


      try {
        // Batch symbols into groups to avoid overwhelming the API
        const BATCH_SIZE = 25
        const batches = []
        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
          batches.push(symbols.slice(i, i + BATCH_SIZE))
        }


        // Process batches sequentially to avoid rate limiting
        for (const batch of batches) {
          const response = await fetch('/api/news/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: batch,
              feedType: 'markets'
            })
          })

          if (!response.ok) {
            if (response.status === 404) {
              console.warn('[watchlist] RSS news API unavailable (404)')
              continue
            }
            console.warn('Failed to fetch RSS news for batch:', response.status)
            continue // Continue with next batch
          }

          const data = await response.json()
          const newsMap = data.news || {}

          // Transform the data into our format
          const rssData: Record<string, RSSNewsMeta> = {}

          batch.forEach(symbol => {
            const articles = newsMap[symbol] || []
            const meta: RSSNewsMeta = {
              symbol,
              articles,
              count: articles.length,
              latestArticle: articles[0]
            }

            rssData[symbol] = meta
            setCachedRSSNews(symbol, meta)
          })

          setRSSNewsData(prev => ({ ...prev, ...rssData }))
        }

      } catch (error) {
        console.warn('[watchlist] Error fetching RSS news, keeping cached data', error)
      } finally {
        fetchInProgress.current = false
        setLoading(false)
      }
    }, 1000), // 1 second debounce to batch more symbols
    [enabled]
  )

  // Fetch RSS news when visible symbols change
  useEffect(() => {
    if (!enabled || visibleSymbols.length === 0) return


    // Filter symbols that need fetching
    const symbolsToFetch = visibleSymbols.filter(symbol => {
      const cached = getCachedRSSNews(symbol)
      return !cached // Only fetch if not in cache
    })

    if (symbolsToFetch.length > 0) {
      fetchRSSNews(symbolsToFetch)
    } else {
      const hasNewsCount = Object.values(rssNewsData).filter((meta: RSSNewsMeta) => meta.count > 0).length
    }
  }, [visibleSymbols, enabled, fetchRSSNews])

  // Function to fetch articles for a specific symbol
  const fetchArticlesForSymbol = useCallback(async (symbol: string): Promise<NewsArticle[]> => {
    try {
      const response = await fetch('/api/news/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: [symbol],
          feedType: 'markets'
        })
      })

      if (!response.ok) {
        console.warn('Failed to fetch RSS articles:', response.status)
        return []
      }

      const data = await response.json()
      const articles = data.news?.[symbol] || []

      // Update cache
      const meta: RSSNewsMeta = {
        symbol,
        articles,
        count: articles.length,
        latestArticle: articles[0]
      }

      setCachedRSSNews(symbol, meta)
      setRSSNewsData(prev => ({ ...prev, [symbol]: meta }))

      return articles
    } catch (error) {
      console.error('Error fetching RSS articles:', error)
      return []
    }
  }, [])

  // Prefetch function (for hover)
  const prefetchArticles = useCallback((symbol: string) => {
    const cached = getCachedRSSNews(symbol)
    if (!cached) {
      // Prefetch in background
      fetchArticlesForSymbol(symbol).catch(console.error)
    }
  }, [fetchArticlesForSymbol])

  return {
    rssNewsData,
    loading,
    fetchArticlesForSymbol,
    prefetchArticles,
    refetch: () => fetchRSSNews(visibleSymbols)
  }
}
