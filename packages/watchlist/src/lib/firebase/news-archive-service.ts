import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  Timestamp
} from 'firebase/firestore'
import { db } from '@watchlist/lib/firebase/config'
import { NewsArticle } from '@watchlist/types'

interface ArchivedArticle {
  headline: string
  description: string
  canonicalUrl: string
  source: 'WSJ' | 'NYT' | 'Bloomberg'
  sourceDomain: string
  publishedAt: Timestamp
  archivedAt: Timestamp
  author?: string
  categories?: string[]
  matchedTickers?: Array<{
    symbol: string
    confidence: number
  }>
  isPaywalled: boolean
  // Topic classification fields
  topics?: string[]
  feedTopic?: string
  topicsClassified?: boolean
  classificationMetadata?: {
    model: string
    promptVersion: string
    classifiedAt: Timestamp
    idempotencyKey: string
  }
  // Macro attribution fields (v2.0.0)
  scope?: 'macro' | 'sector' | 'company' | 'other'
  macroEventType?: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy' | null
}

export class NewsArchiveService {
  private static instance: NewsArchiveService
  private collectionName = 'newsArchive'

  static getInstance(): NewsArchiveService {
    if (!this.instance) {
      this.instance = new NewsArchiveService()
    }
    return this.instance
  }

  /**
   * Archive a new article
   */
  async archiveArticle(article: NewsArticle): Promise<void> {
    const articleId = this.generateArticleId(article.canonicalUrl)
    // Use simpler path structure that works with client SDK
    const archiveRef = doc(db, 'newsArchive', articleId)

    const archivedArticle: ArchivedArticle = {
      headline: article.headline,
      description: article.description,
      canonicalUrl: article.canonicalUrl,
      source: article.source as 'WSJ' | 'NYT' | 'Bloomberg',
      sourceDomain: article.sourceDomain,
      publishedAt: Timestamp.fromDate(article.publishedAt),
      archivedAt: Timestamp.now(),
      isPaywalled: article.isPaywalled || false
    }

    // Only add optional fields if they exist
    if (article.author) {
      archivedArticle.author = article.author
    }
    if (article.categories && article.categories.length > 0) {
      archivedArticle.categories = article.categories
    }
    if (article.matchedTickers && article.matchedTickers.length > 0) {
      archivedArticle.matchedTickers = article.matchedTickers.map(ticker => ({
        symbol: ticker.symbol,
        confidence: ticker.confidence
      }))
    }

    // Add topic classification fields
    if (article.feedTopic) {
      archivedArticle.feedTopic = article.feedTopic
    }
    if (article.topics && article.topics.length > 0) {
      archivedArticle.topics = article.topics
    }
    if (article.topicsClassified !== undefined) {
      archivedArticle.topicsClassified = article.topicsClassified
    }
    if (article.classificationMetadata) {
      archivedArticle.classificationMetadata = {
        model: article.classificationMetadata.model,
        promptVersion: article.classificationMetadata.promptVersion,
        classifiedAt: Timestamp.fromDate(article.classificationMetadata.classifiedAt),
        idempotencyKey: article.classificationMetadata.idempotencyKey
      }
    }

    // Add macro attribution fields (v2.0.0)
    if (article.scope) {
      archivedArticle.scope = article.scope
    }
    if (article.macroEventType !== undefined) {
      archivedArticle.macroEventType = article.macroEventType
    }

    await setDoc(archiveRef, archivedArticle, { merge: false })

    // Add to ticker indices if matched
    if (article.matchedTickers) {
      for (const ticker of article.matchedTickers) {
        await this.addToTickerIndex(ticker.symbol, articleId, article.publishedAt)
      }
    }

    // Add to source index
    await this.addToSourceIndex(article.source, articleId, article.publishedAt)
  }

  /**
   * Check if an article already exists in the archive
   */
  async articleExists(url: string): Promise<boolean> {
    const articleId = this.generateArticleId(url)
    const docRef = doc(db, 'newsArchive', articleId)
    const docSnap = await getDoc(docRef)
    return docSnap.exists()
  }

  /**
   * Get archived articles by ticker
   */
  async getArticlesByTicker(
    ticker: string,
    daysBack: number = 7,
    maxResults: number = 50
  ): Promise<NewsArticle[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    const tickerQuery = query(
      collection(db, `newsArchiveByTicker_${ticker}`),
      where('date', '>=', Timestamp.fromDate(cutoffDate)),
      orderBy('date', 'desc'),
      limit(maxResults)
    )

    const querySnapshot = await getDocs(tickerQuery)
    const articleIds = querySnapshot.docs.map(doc => doc.id)

    // Fetch full articles
    const articles: NewsArticle[] = []
    for (const articleId of articleIds) {
      const article = await this.getArticleById(articleId)
      if (article) articles.push(article)
    }

    return articles
  }

  /**
   * Get archived articles by source
   */
  async getArticlesBySource(
    source: string,
    daysBack: number = 7,
    maxResults: number = 50
  ): Promise<NewsArticle[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    const sourceQuery = query(
      collection(db, `newsArchiveBySource_${source}`),
      where('date', '>=', Timestamp.fromDate(cutoffDate)),
      orderBy('date', 'desc'),
      limit(maxResults)
    )

    const querySnapshot = await getDocs(sourceQuery)
    const articleIds = querySnapshot.docs.map(doc => doc.id)

    // Fetch full articles
    const articles: NewsArticle[] = []
    for (const articleId of articleIds) {
      const article = await this.getArticleById(articleId)
      if (article) articles.push(article)
    }

    return articles
  }

  /**
   * Get all archived articles within a date range
   */
  async getArchivedArticles(
    daysBack: number = 7,
    sources?: string[],
    maxResults: number = 100
  ): Promise<NewsArticle[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    // Simplified query without composite index requirement
    const articlesQuery = query(
      collection(db, 'newsArchive'),
      where('publishedAt', '>=', Timestamp.fromDate(cutoffDate)),
      orderBy('publishedAt', 'desc'),
      limit(maxResults)
    )

    const querySnapshot = await getDocs(articlesQuery)

    let articles = querySnapshot.docs.map(doc => this.convertToNewsArticle(doc.id, doc.data() as ArchivedArticle))

    // Filter by source after fetching if needed
    if (sources && sources.length > 0) {
      articles = articles.filter(article => sources.includes(article.source))
    }

    return articles
  }

  /**
   * Clean up articles older than the retention period
   */
  async cleanupOldArticles(retentionDays: number = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const oldArticlesQuery = query(
      collection(db, 'newsArchive'),
      where('publishedAt', '<', Timestamp.fromDate(cutoffDate)),
      limit(100) // Process in batches
    )

    const querySnapshot = await getDocs(oldArticlesQuery)
    let deletedCount = 0

    for (const docSnapshot of querySnapshot.docs) {
      await deleteDoc(docSnapshot.ref)
      deletedCount++

      // Also clean up indices (would need to track these separately in production)
      // For now, indices will be cleaned up manually or via a separate process
    }

    return deletedCount
  }

  /**
   * Private helper methods
   */
  private generateArticleId(url: string): string {
    // Use URL hash as article ID
    const hash = this.hashUrl(url)
    return hash
  }

  private hashUrl(url: string): string {
    // Simple hash function for URL
    let hash = 0
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }

  private async addToTickerIndex(ticker: string, articleId: string, publishedAt: Date): Promise<void> {
    const dateStr = publishedAt.toISOString().split('T')[0]
    const indexRef = doc(db, `newsArchiveByTicker_${ticker}`, `${dateStr}_${articleId}`)
    await setDoc(indexRef, { date: Timestamp.fromDate(publishedAt) })
  }

  private async addToSourceIndex(source: string, articleId: string, publishedAt: Date): Promise<void> {
    const dateStr = publishedAt.toISOString().split('T')[0]
    const indexRef = doc(db, `newsArchiveBySource_${source}`, `${dateStr}_${articleId}`)
    await setDoc(indexRef, { date: Timestamp.fromDate(publishedAt) })
  }

  private async getArticleById(articleId: string): Promise<NewsArticle | null> {
    const docRef = doc(db, 'newsArchive', articleId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) return null

    return this.convertToNewsArticle(articleId, docSnap.data() as ArchivedArticle)
  }

  private convertToNewsArticle(id: string, archived: ArchivedArticle): NewsArticle {
    return {
      id,
      headline: archived.headline,
      description: archived.description,
      canonicalUrl: archived.canonicalUrl,
      source: archived.source,
      sourceDomain: archived.sourceDomain,
      publishedAt: archived.publishedAt.toDate(),
      author: archived.author,
      categories: archived.categories,
      matchedTickers: archived.matchedTickers?.map(ticker => ({
        symbol: ticker.symbol,
        confidence: ticker.confidence,
        matchType: 'context' as const,
        matchedTerms: []
      })),
      isPaywalled: archived.isPaywalled,
      normalizedTitle: archived.headline.toLowerCase().replace(/[^a-z0-9]/g, ''),
      normalizedDescription: archived.description.toLowerCase().replace(/[^a-z0-9]/g, ''),
      isArchived: true,
      // Topic classification fields
      topics: archived.topics,
      feedTopic: archived.feedTopic,
      topicsClassified: archived.topicsClassified,
      classificationMetadata: archived.classificationMetadata ? {
        model: archived.classificationMetadata.model,
        promptVersion: archived.classificationMetadata.promptVersion,
        classifiedAt: archived.classificationMetadata.classifiedAt.toDate(),
        idempotencyKey: archived.classificationMetadata.idempotencyKey
      } : undefined,
      // Macro attribution fields (v2.0.0)
      scope: archived.scope,
      macroEventType: archived.macroEventType
    }
  }
}

export const newsArchiveService = NewsArchiveService.getInstance()