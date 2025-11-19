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
export interface EarningsCronMetric {
    jobType: 'main' | 'bmo-refresh' | 'amc-refresh';
    timestamp: number;
    duration: number;
    symbolsProcessed: number;
    symbolsSucceeded: number;
    symbolsFailed: number;
    errors: Array<{
        symbol: string;
        error: string;
    }>;
    cacheHits: number;
    cacheMisses: number;
}
export interface ConfidenceMetric {
    symbol: string;
    timestamp: number;
    confidence: number;
    status: 'upcoming' | 'today_bmo' | 'today_amc' | 'recent' | 'none';
    breakdown: {
        temporal: number;
        volume: number;
        news: number;
        analyst: number;
        gap: number;
        negative: number;
    };
    includedInAISummary: boolean;
}
export interface BeatQualityMetric {
    symbol: string;
    timestamp: number;
    date: string;
    epsQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate';
    revenueQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate';
    overallScore: number;
    stars: number;
    epsBeatPercent: number;
    revenueBeatPercent: number;
}
export interface EarningsAPIMetric {
    endpoint: '/api/earnings/context' | '/api/news/ai-summary';
    timestamp: number;
    duration: number;
    symbol?: string;
    symbolCount?: number;
    success: boolean;
    error?: string;
    cacheHit: boolean;
}
declare class EarningsMonitor {
    private enabled;
    constructor();
    /**
     * Log cron job execution metrics
     */
    logCronExecution(metric: EarningsCronMetric): Promise<void>;
    /**
     * Log confidence scoring metrics
     */
    logConfidenceScore(metric: ConfidenceMetric): Promise<void>;
    /**
     * Log beat quality metrics
     */
    logBeatQuality(metric: BeatQualityMetric): Promise<void>;
    /**
     * Log API usage metrics
     */
    logAPIUsage(metric: EarningsAPIMetric): Promise<void>;
    /**
     * Get cron job health summary (last 24 hours)
     */
    getCronHealthSummary(): Promise<{
        totalExecutions: number;
        avgDuration: number;
        totalSymbolsProcessed: number;
        avgSuccessRate: number;
        recentErrors: Array<{
            jobType: string;
            error: string;
            timestamp: number;
        }>;
    }>;
    /**
     * Get confidence score distribution (last 7 days)
     */
    getConfidenceDistribution(): Promise<{
        buckets: {
            range: string;
            count: number;
        }[];
        avgConfidence: number;
        includedInAISummaryRate: number;
    }>;
    /**
     * Get beat quality distribution (last 30 days)
     */
    getBeatQualityDistribution(): Promise<{
        epsDistribution: {
            quality: string;
            count: number;
        }[];
        revenueDistribution: {
            quality: string;
            count: number;
        }[];
        avgOverallScore: number;
        avgStarRating: number;
    }>;
}
export declare const earningsMonitor: EarningsMonitor;
export {};
