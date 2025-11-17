/**
 * Earnings Feature Monitoring & Metrics
 *
 * Tracks key metrics for the earnings integration feature:
 * - Cron job execution stats
 * - Confidence scoring distribution
 * - Beat quality distribution
 * - API usage and performance
 * - Error rates and types
 */

import { db } from '../firebase/config'
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'

export interface EarningsCronMetric {
  jobType: 'main' | 'bmo-refresh' | 'amc-refresh'
  timestamp: number
  duration: number
  symbolsProcessed: number
  symbolsSucceeded: number
  symbolsFailed: number
  errors: Array<{ symbol: string; error: string }>
  cacheHits: number
  cacheMisses: number
}

export interface ConfidenceMetric {
  symbol: string
  timestamp: number
  confidence: number
  status: 'upcoming' | 'today_bmo' | 'today_amc' | 'recent' | 'none'
  breakdown: {
    temporal: number
    volume: number
    news: number
    analyst: number
    gap: number
    negative: number
  }
  includedInAISummary: boolean
}

export interface BeatQualityMetric {
  symbol: string
  timestamp: number
  date: string
  epsQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate'
  revenueQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate'
  overallScore: number
  stars: number
  epsBeatPercent: number
  revenueBeatPercent: number
}

export interface EarningsAPIMetric {
  endpoint: '/api/earnings/context' | '/api/news/ai-summary'
  timestamp: number
  duration: number
  symbol?: string
  symbolCount?: number
  success: boolean
  error?: string
  cacheHit: boolean
}

class EarningsMonitor {
  private enabled: boolean

  constructor() {
    // Enable monitoring in production and development
    this.enabled = true
  }

  /**
   * Log cron job execution metrics
   */
  async logCronExecution(metric: EarningsCronMetric): Promise<void> {
    if (!this.enabled) return

    try {
      console.log('[Earnings Monitor] Cron execution:', {
        jobType: metric.jobType,
        duration: `${metric.duration}ms`,
        processed: metric.symbolsProcessed,
        succeeded: metric.symbolsSucceeded,
        failed: metric.symbolsFailed,
        cacheHitRate: `${((metric.cacheHits / (metric.cacheHits + metric.cacheMisses)) * 100).toFixed(1)}%`
      })

      // Store in Firestore for historical tracking
      await addDoc(collection(db, 'earningsMetrics', 'cron', 'executions'), {
        ...metric,
        createdAt: Timestamp.fromMillis(metric.timestamp)
      })

      // Alert on high failure rate
      const failureRate = metric.symbolsFailed / metric.symbolsProcessed
      if (failureRate > 0.1) {
        console.warn(`[Earnings Monitor] ⚠️ High failure rate: ${(failureRate * 100).toFixed(1)}%`)
        if (metric.errors.length > 0) {
          console.warn('[Earnings Monitor] Sample errors:', metric.errors.slice(0, 3))
        }
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to log cron metric:', error)
    }
  }

  /**
   * Log confidence scoring metrics
   */
  async logConfidenceScore(metric: ConfidenceMetric): Promise<void> {
    if (!this.enabled) return

    try {
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Earnings Monitor] Confidence: ${metric.symbol} = ${metric.confidence}% (${metric.status})`)
      }

      // Store in Firestore (sample 10% to reduce writes)
      if (Math.random() < 0.1) {
        await addDoc(collection(db, 'earningsMetrics', 'confidence', 'scores'), {
          ...metric,
          createdAt: Timestamp.fromMillis(metric.timestamp)
        })
      }

      // Track inclusion in AI summary
      if (metric.includedInAISummary) {
        console.log(`[Earnings Monitor] ✅ Included in AI summary: ${metric.symbol} (${metric.confidence}%)`)
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to log confidence metric:', error)
    }
  }

  /**
   * Log beat quality metrics
   */
  async logBeatQuality(metric: BeatQualityMetric): Promise<void> {
    if (!this.enabled) return

    try {
      console.log(`[Earnings Monitor] Beat Quality: ${metric.symbol} = ${metric.overallScore}/100 (${metric.stars} stars)`)

      // Store in Firestore
      await addDoc(collection(db, 'earningsMetrics', 'beatQuality', 'scores'), {
        ...metric,
        createdAt: Timestamp.fromMillis(metric.timestamp)
      })

    } catch (error) {
      console.error('[Earnings Monitor] Failed to log beat quality metric:', error)
    }
  }

  /**
   * Log API usage metrics
   */
  async logAPIUsage(metric: EarningsAPIMetric): Promise<void> {
    if (!this.enabled) return

    try {
      const status = metric.success ? '✅' : '❌'
      console.log(`[Earnings Monitor] ${status} ${metric.endpoint} (${metric.duration}ms)`)

      // Store in Firestore (sample 20% to reduce writes)
      if (Math.random() < 0.2) {
        await addDoc(collection(db, 'earningsMetrics', 'api', 'usage'), {
          ...metric,
          createdAt: Timestamp.fromMillis(metric.timestamp)
        })
      }

      // Alert on slow requests (> 5s)
      if (metric.duration > 5000) {
        console.warn(`[Earnings Monitor] ⚠️ Slow request: ${metric.endpoint} took ${metric.duration}ms`)
      }

      // Alert on errors
      if (!metric.success) {
        console.error(`[Earnings Monitor] ❌ API error: ${metric.endpoint}`, metric.error)
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to log API metric:', error)
    }
  }

  /**
   * Get cron job health summary (last 24 hours)
   */
  async getCronHealthSummary(): Promise<{
    totalExecutions: number
    avgDuration: number
    totalSymbolsProcessed: number
    avgSuccessRate: number
    recentErrors: Array<{ jobType: string; error: string; timestamp: number }>
  }> {
    try {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      const q = query(
        collection(db, 'earningsMetrics', 'cron', 'executions'),
        where('timestamp', '>', oneDayAgo),
        orderBy('timestamp', 'desc'),
        limit(100)
      )

      const snapshot = await getDocs(q)
      const executions = snapshot.docs.map(doc => doc.data() as EarningsCronMetric)

      if (executions.length === 0) {
        return {
          totalExecutions: 0,
          avgDuration: 0,
          totalSymbolsProcessed: 0,
          avgSuccessRate: 0,
          recentErrors: []
        }
      }

      const totalDuration = executions.reduce((sum, e) => sum + e.duration, 0)
      const totalProcessed = executions.reduce((sum, e) => sum + e.symbolsProcessed, 0)
      const totalSucceeded = executions.reduce((sum, e) => sum + e.symbolsSucceeded, 0)

      const recentErrors = executions
        .flatMap(e => e.errors.map(err => ({
          jobType: e.jobType,
          error: err.error,
          timestamp: e.timestamp
        })))
        .slice(0, 10)

      return {
        totalExecutions: executions.length,
        avgDuration: totalDuration / executions.length,
        totalSymbolsProcessed: totalProcessed,
        avgSuccessRate: (totalSucceeded / totalProcessed) * 100,
        recentErrors
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to get cron health summary:', error)
      return {
        totalExecutions: 0,
        avgDuration: 0,
        totalSymbolsProcessed: 0,
        avgSuccessRate: 0,
        recentErrors: []
      }
    }
  }

  /**
   * Get confidence score distribution (last 7 days)
   */
  async getConfidenceDistribution(): Promise<{
    buckets: { range: string; count: number }[]
    avgConfidence: number
    includedInAISummaryRate: number
  }> {
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const q = query(
        collection(db, 'earningsMetrics', 'confidence', 'scores'),
        where('timestamp', '>', sevenDaysAgo),
        limit(1000)
      )

      const snapshot = await getDocs(q)
      const scores = snapshot.docs.map(doc => doc.data() as ConfidenceMetric)

      if (scores.length === 0) {
        return {
          buckets: [],
          avgConfidence: 0,
          includedInAISummaryRate: 0
        }
      }

      // Create buckets
      const buckets = [
        { range: '0-30', count: 0 },
        { range: '30-50', count: 0 },
        { range: '50-70', count: 0 },
        { range: '70-90', count: 0 },
        { range: '90-100', count: 0 }
      ]

      let totalConfidence = 0
      let includedCount = 0

      scores.forEach(score => {
        totalConfidence += score.confidence
        if (score.includedInAISummary) includedCount++

        if (score.confidence < 30) buckets[0].count++
        else if (score.confidence < 50) buckets[1].count++
        else if (score.confidence < 70) buckets[2].count++
        else if (score.confidence < 90) buckets[3].count++
        else buckets[4].count++
      })

      return {
        buckets,
        avgConfidence: totalConfidence / scores.length,
        includedInAISummaryRate: (includedCount / scores.length) * 100
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to get confidence distribution:', error)
      return {
        buckets: [],
        avgConfidence: 0,
        includedInAISummaryRate: 0
      }
    }
  }

  /**
   * Get beat quality distribution (last 30 days)
   */
  async getBeatQualityDistribution(): Promise<{
    epsDistribution: { quality: string; count: number }[]
    revenueDistribution: { quality: string; count: number }[]
    avgOverallScore: number
    avgStarRating: number
  }> {
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const q = query(
        collection(db, 'earningsMetrics', 'beatQuality', 'scores'),
        where('timestamp', '>', thirtyDaysAgo),
        limit(1000)
      )

      const snapshot = await getDocs(q)
      const scores = snapshot.docs.map(doc => doc.data() as BeatQualityMetric)

      if (scores.length === 0) {
        return {
          epsDistribution: [],
          revenueDistribution: [],
          avgOverallScore: 0,
          avgStarRating: 0
        }
      }

      const qualities = ['strong_beat', 'beat', 'inline', 'miss', 'strong_miss', 'no_estimate']
      const epsDistribution = qualities.map(q => ({ quality: q, count: 0 }))
      const revenueDistribution = qualities.map(q => ({ quality: q, count: 0 }))

      let totalScore = 0
      let totalStars = 0

      scores.forEach(score => {
        const epsIdx = qualities.indexOf(score.epsQuality)
        const revIdx = qualities.indexOf(score.revenueQuality)
        if (epsIdx !== -1) epsDistribution[epsIdx].count++
        if (revIdx !== -1) revenueDistribution[revIdx].count++

        totalScore += score.overallScore
        totalStars += score.stars
      })

      return {
        epsDistribution,
        revenueDistribution,
        avgOverallScore: totalScore / scores.length,
        avgStarRating: totalStars / scores.length
      }

    } catch (error) {
      console.error('[Earnings Monitor] Failed to get beat quality distribution:', error)
      return {
        epsDistribution: [],
        revenueDistribution: [],
        avgOverallScore: 0,
        avgStarRating: 0
      }
    }
  }
}

// Export singleton instance
export const earningsMonitor = new EarningsMonitor()
