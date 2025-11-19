'use server'

import { NextRequest, NextResponse } from 'next/server'
import Parser from 'rss-parser'
import crypto from 'crypto'
import type { NewsArticle } from '@watchlist/types'
import { getFeedTopic } from '@watchlist/config/topics'

const BLOOMBERG_FEEDS = {
  markets: 'https://feeds.bloomberg.com/markets/news.rss',
  technology: 'https://feeds.bloomberg.com/technology/news.rss',
  politics: 'https://feeds.bloomberg.com/politics/news.rss',
  wealth: 'https://feeds.bloomberg.com/wealth/news.rss',
  industries: 'https://feeds.bloomberg.com/industries/news.rss'
}

const CACHE_TTL = 5 * 60 * 1000
const cache = new Map<string, { data: any; timestamp: number }>()

const createUrlHash = (url: string): string => crypto.createHash('md5').update(url).digest('hex')
const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return 'bloomberg.com'
  }
}

const parser = new Parser({
  customFields: {
    item: [
      ['description', 'description'],
      ['content:encoded', 'content'],
      ['dc:creator', 'author'],
      ['category', 'categories', { keepArray: true }],
      ['media:content', 'media']
    ]
  }
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const feedType = searchParams.get('feed') || 'markets'

    const cacheKey = `bloomberg_${feedType}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=300'
        }
      })
    }

    const feedUrl = BLOOMBERG_FEEDS[feedType as keyof typeof BLOOMBERG_FEEDS] || BLOOMBERG_FEEDS.markets
    const feed = await parser.parseURL(feedUrl)

    const articles: NewsArticle[] = []
    const now = new Date()
    const filterMonths = process.env.NODE_ENV === 'development' ? 12 : 1
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - filterMonths)

    for (const item of feed.items || []) {
      const url = item.link || item.guid || ''
      if (!url) continue

      const articleDate = new Date(item.pubDate || item.isoDate || Date.now())
      if (articleDate < cutoffDate) continue

      const cleanUrl = url.split('?')[0]
      const article: NewsArticle = {
        id: createUrlHash(cleanUrl),
        headline: (item.title || '').trim(),
        description: (item.contentSnippet || item.description || '').trim(),
        canonicalUrl: cleanUrl,
        sourceDomain: extractDomain(cleanUrl),
        source: 'Bloomberg',
        isPaywalled: true,
        publishedAt: articleDate,
        normalizedTitle: normalizeText(item.title || ''),
        normalizedDescription: normalizeText(item.contentSnippet || item.description || ''),
        author: item.creator || item.author,
        categories: Array.isArray(item.categories) ? item.categories : [],
        feedTopic: getFeedTopic('Bloomberg', feedType),
        topicsClassified: false
      }

      articles.push(article)
    }

    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

    const responseData = {
      source: 'Bloomberg',
      feedType,
      articleCount: articles.length,
      articles,
      lastUpdated: new Date().toISOString()
    }

    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    })

    return NextResponse.json(responseData, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300'
      }
    })
  } catch (error: any) {
    console.error('Error fetching Bloomberg RSS:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Bloomberg news',
        message: error?.message || 'Unknown error',
        source: 'Bloomberg',
        articles: []
      },
      { status: 500 }
    )
  }
}
