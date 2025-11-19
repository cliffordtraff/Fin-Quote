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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { db } from '../firebase/config';
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
class EarningsMonitor {
    constructor() {
        // Enable monitoring in production and development
        this.enabled = true;
    }
    /**
     * Log cron job execution metrics
     */
    logCronExecution(metric) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled)
                return;
            try {
                console.log('[Earnings Monitor] Cron execution:', {
                    jobType: metric.jobType,
                    duration: `${metric.duration}ms`,
                    processed: metric.symbolsProcessed,
                    succeeded: metric.symbolsSucceeded,
                    failed: metric.symbolsFailed,
                    cacheHitRate: `${((metric.cacheHits / (metric.cacheHits + metric.cacheMisses)) * 100).toFixed(1)}%`
                });
                // Store in Firestore for historical tracking
                yield addDoc(collection(db, 'earningsMetrics', 'cron', 'executions'), Object.assign(Object.assign({}, metric), { createdAt: Timestamp.fromMillis(metric.timestamp) }));
                // Alert on high failure rate
                const failureRate = metric.symbolsFailed / metric.symbolsProcessed;
                if (failureRate > 0.1) {
                    console.warn(`[Earnings Monitor] ⚠️ High failure rate: ${(failureRate * 100).toFixed(1)}%`);
                    if (metric.errors.length > 0) {
                        console.warn('[Earnings Monitor] Sample errors:', metric.errors.slice(0, 3));
                    }
                }
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to log cron metric:', error);
            }
        });
    }
    /**
     * Log confidence scoring metrics
     */
    logConfidenceScore(metric) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled)
                return;
            try {
                // Log to console in development
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[Earnings Monitor] Confidence: ${metric.symbol} = ${metric.confidence}% (${metric.status})`);
                }
                // Store in Firestore (sample 10% to reduce writes)
                if (Math.random() < 0.1) {
                    yield addDoc(collection(db, 'earningsMetrics', 'confidence', 'scores'), Object.assign(Object.assign({}, metric), { createdAt: Timestamp.fromMillis(metric.timestamp) }));
                }
                // Track inclusion in AI summary
                if (metric.includedInAISummary) {
                    console.log(`[Earnings Monitor] ✅ Included in AI summary: ${metric.symbol} (${metric.confidence}%)`);
                }
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to log confidence metric:', error);
            }
        });
    }
    /**
     * Log beat quality metrics
     */
    logBeatQuality(metric) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled)
                return;
            try {
                console.log(`[Earnings Monitor] Beat Quality: ${metric.symbol} = ${metric.overallScore}/100 (${metric.stars} stars)`);
                // Store in Firestore
                yield addDoc(collection(db, 'earningsMetrics', 'beatQuality', 'scores'), Object.assign(Object.assign({}, metric), { createdAt: Timestamp.fromMillis(metric.timestamp) }));
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to log beat quality metric:', error);
            }
        });
    }
    /**
     * Log API usage metrics
     */
    logAPIUsage(metric) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.enabled)
                return;
            try {
                const status = metric.success ? '✅' : '❌';
                console.log(`[Earnings Monitor] ${status} ${metric.endpoint} (${metric.duration}ms)`);
                // Store in Firestore (sample 20% to reduce writes)
                if (Math.random() < 0.2) {
                    yield addDoc(collection(db, 'earningsMetrics', 'api', 'usage'), Object.assign(Object.assign({}, metric), { createdAt: Timestamp.fromMillis(metric.timestamp) }));
                }
                // Alert on slow requests (> 5s)
                if (metric.duration > 5000) {
                    console.warn(`[Earnings Monitor] ⚠️ Slow request: ${metric.endpoint} took ${metric.duration}ms`);
                }
                // Alert on errors
                if (!metric.success) {
                    console.error(`[Earnings Monitor] ❌ API error: ${metric.endpoint}`, metric.error);
                }
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to log API metric:', error);
            }
        });
    }
    /**
     * Get cron job health summary (last 24 hours)
     */
    getCronHealthSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
                const q = query(collection(db, 'earningsMetrics', 'cron', 'executions'), where('timestamp', '>', oneDayAgo), orderBy('timestamp', 'desc'), limit(100));
                const snapshot = yield getDocs(q);
                const executions = snapshot.docs.map(doc => doc.data());
                if (executions.length === 0) {
                    return {
                        totalExecutions: 0,
                        avgDuration: 0,
                        totalSymbolsProcessed: 0,
                        avgSuccessRate: 0,
                        recentErrors: []
                    };
                }
                const totalDuration = executions.reduce((sum, e) => sum + e.duration, 0);
                const totalProcessed = executions.reduce((sum, e) => sum + e.symbolsProcessed, 0);
                const totalSucceeded = executions.reduce((sum, e) => sum + e.symbolsSucceeded, 0);
                const recentErrors = executions
                    .flatMap(e => e.errors.map(err => ({
                    jobType: e.jobType,
                    error: err.error,
                    timestamp: e.timestamp
                })))
                    .slice(0, 10);
                return {
                    totalExecutions: executions.length,
                    avgDuration: totalDuration / executions.length,
                    totalSymbolsProcessed: totalProcessed,
                    avgSuccessRate: (totalSucceeded / totalProcessed) * 100,
                    recentErrors
                };
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to get cron health summary:', error);
                return {
                    totalExecutions: 0,
                    avgDuration: 0,
                    totalSymbolsProcessed: 0,
                    avgSuccessRate: 0,
                    recentErrors: []
                };
            }
        });
    }
    /**
     * Get confidence score distribution (last 7 days)
     */
    getConfidenceDistribution() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                const q = query(collection(db, 'earningsMetrics', 'confidence', 'scores'), where('timestamp', '>', sevenDaysAgo), limit(1000));
                const snapshot = yield getDocs(q);
                const scores = snapshot.docs.map(doc => doc.data());
                if (scores.length === 0) {
                    return {
                        buckets: [],
                        avgConfidence: 0,
                        includedInAISummaryRate: 0
                    };
                }
                // Create buckets
                const buckets = [
                    { range: '0-30', count: 0 },
                    { range: '30-50', count: 0 },
                    { range: '50-70', count: 0 },
                    { range: '70-90', count: 0 },
                    { range: '90-100', count: 0 }
                ];
                let totalConfidence = 0;
                let includedCount = 0;
                scores.forEach(score => {
                    totalConfidence += score.confidence;
                    if (score.includedInAISummary)
                        includedCount++;
                    if (score.confidence < 30)
                        buckets[0].count++;
                    else if (score.confidence < 50)
                        buckets[1].count++;
                    else if (score.confidence < 70)
                        buckets[2].count++;
                    else if (score.confidence < 90)
                        buckets[3].count++;
                    else
                        buckets[4].count++;
                });
                return {
                    buckets,
                    avgConfidence: totalConfidence / scores.length,
                    includedInAISummaryRate: (includedCount / scores.length) * 100
                };
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to get confidence distribution:', error);
                return {
                    buckets: [],
                    avgConfidence: 0,
                    includedInAISummaryRate: 0
                };
            }
        });
    }
    /**
     * Get beat quality distribution (last 30 days)
     */
    getBeatQualityDistribution() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const q = query(collection(db, 'earningsMetrics', 'beatQuality', 'scores'), where('timestamp', '>', thirtyDaysAgo), limit(1000));
                const snapshot = yield getDocs(q);
                const scores = snapshot.docs.map(doc => doc.data());
                if (scores.length === 0) {
                    return {
                        epsDistribution: [],
                        revenueDistribution: [],
                        avgOverallScore: 0,
                        avgStarRating: 0
                    };
                }
                const qualities = ['strong_beat', 'beat', 'inline', 'miss', 'strong_miss', 'no_estimate'];
                const epsDistribution = qualities.map(q => ({ quality: q, count: 0 }));
                const revenueDistribution = qualities.map(q => ({ quality: q, count: 0 }));
                let totalScore = 0;
                let totalStars = 0;
                scores.forEach(score => {
                    const epsIdx = qualities.indexOf(score.epsQuality);
                    const revIdx = qualities.indexOf(score.revenueQuality);
                    if (epsIdx !== -1)
                        epsDistribution[epsIdx].count++;
                    if (revIdx !== -1)
                        revenueDistribution[revIdx].count++;
                    totalScore += score.overallScore;
                    totalStars += score.stars;
                });
                return {
                    epsDistribution,
                    revenueDistribution,
                    avgOverallScore: totalScore / scores.length,
                    avgStarRating: totalStars / scores.length
                };
            }
            catch (error) {
                console.error('[Earnings Monitor] Failed to get beat quality distribution:', error);
                return {
                    epsDistribution: [],
                    revenueDistribution: [],
                    avgOverallScore: 0,
                    avgStarRating: 0
                };
            }
        });
    }
}
// Export singleton instance
export const earningsMonitor = new EarningsMonitor();
