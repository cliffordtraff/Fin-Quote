'use server'

import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'
import crypto from 'crypto'
import type { NewsArticle } from '@watchlist/types'
import { getFeedTopic } from '@watchlist/config/topics'

const WSJ_FEEDS = {
  markets: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',
  business: 'https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness',
  tech: 'https://feeds.content.dowjones.io/public/rss/RSSWSJD',
  opinion: 'https://feeds.content.dowjones.io/public/rss/RSSOpinion'
}

const CACHE_TTL = 5 * 60 * 1000
const cache = new Map<string, { data: any; timestamp: number; etag?: string }>()

const createUrlHash = (url: string): string => crypto.createHash('md5').update(url).digest('hex')

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return 'wsj.com'
  }
}

const parser = new Parser({
  customFields: {
    item: [
      ['description', 'description'],
      ['content:encoded', 'content'],
      ['dc:creator', 'author'],
      ['category', 'categories', { keepArray: true }]
    ]
  }
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const feedType = searchParams.get('feed') || 'markets'
    const ifNoneMatch = request.headers.get('if-none-match')
    const ifModifiedSince = request.headers.get('if-modified-since')

    const cacheKey = `wsj_${feedType}`
    const cached = cache.get(cacheKey)
    if (cached) {
      const age = Date.now() - cached.timestamp
      if (ifNoneMatch === cached.etag && age < CACHE_TTL) {
        return new NextResponse(null, { status: 304 })
      }
      if (age < CACHE_TTL) {
        return NextResponse.json(cached.data, {
          headers: {
            'Cache-Control': `public, max-age=${Math.floor((CACHE_TTL - age) / 1000)}`,
            'ETag': cached.etag || ''
          }
        })
      }
    }

    const feedUrl = WSJ_FEEDS[feedType as keyof typeof WSJ_FEEDS] || WSJ_FEEDS.markets
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    let feedText = ''
    try {
      const response = await fetch(feedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FinQuoteWatchlist/1.0)'
        }
      })
      clearTimeout(timeoutId)
      if (!response.ok) {
        throw new Error(`RSS feed returned ${response.status}`)
      }
      feedText = await response.text()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }

    const feed = await parser.parseString(feedText)
    const articles: NewsArticle[] = []
    const seen = new Set<string>()

    const now = new Date()
    const filterMonths = process.env.NODE_ENV === 'development' ? 12 : 1
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - filterMonths)
    const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    for (const item of feed.items || []) {
      if (!item.link) continue
      const articleDate = new Date(item.pubDate || item.isoDate || Date.now())
      if (articleDate < cutoffDate || articleDate > oneDayAhead) continue

      const urlHash = createUrlHash(item.link)
      if (seen.has(urlHash)) continue
      seen.add(urlHash)

      const headline = item.title || ''
      const description = item.contentSnippet || item.description || ''
      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim()

      const article: NewsArticle = {
        id: urlHash,
        headline: headline.trim(),
        description: cleanDescription.substring(0, 500),
        canonicalUrl: item.link,
        sourceDomain: extractDomain(item.link),
        source: 'WSJ',
        isPaywalled: true,
        publishedAt: articleDate,
        normalizedTitle: normalizeText(headline),
        normalizedDescription: normalizeText(cleanDescription),
        feedTopic: getFeedTopic('WSJ', feedType),
        topicsClassified: false
      }

      articles.push(article)
    }

    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

    const responseData = {
      articles,
      feedType,
      lastUpdated: new Date().toISOString(),
      totalArticles: articles.length
    }

    const etag = crypto
      .createHash('md5')
      .update(JSON.stringify(articles.slice(0, 5)))
      .digest('hex')

    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      etag
    })

    for (const [key, value] of cache.entries()) {
      if (Date.now() - value.timestamp > CACHE_TTL * 2) {
        cache.delete(key)
      }
    }

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `public, max-age=${Math.floor(CACHE_TTL / 1000)}`,
        'ETag': etag,
        'Last-Modified': new Date().toUTCString()
      }
    })
  } catch (error: any) {
    console.error('Error fetching WSJ RSS:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch WSJ news',
        message: error?.message || 'Unknown error',
        source: 'WSJ',
        articles: []
      },
      { status: 500 }
    )
  }
}
