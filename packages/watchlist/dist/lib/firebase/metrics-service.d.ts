/**
 * Firestore service for AI Summary Metrics persistence
 *
 * Stores metrics with automatic cleanup of old data
 */
import { SummaryMetrics } from '@watchlist/lib/monitoring/whyItMovedMonitor';
/**
 * Save a metric to Firestore
 */
export declare function saveMetric(metrics: SummaryMetrics): Promise<void>;
/**
 * Get metrics for a time window
 */
export declare function getMetrics(startTime: number, endTime?: number): Promise<SummaryMetrics[]>;
/**
 * Get metrics for last N hours
 */
export declare function getRecentMetrics(hours?: number): Promise<SummaryMetrics[]>;
/**
 * Get aggregated stats for a time period
 */
export declare function getAggregatedStats(hours?: number): Promise<{
    totalRequests: number;
    validationPassRate: number;
    retryRate: number;
    fallbackRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
}>;
/**
 * Get hourly breakdown for charts
 */
export declare function getHourlyBreakdown(hours?: number): Promise<{
    avgLatency: number;
    passRate: string;
    hour: string;
    timestamp: number;
    total: number;
    passed: number;
    retried: number;
    fallback: number;
}[]>;
/**
 * Clean up old metrics (run periodically)
 */
export declare function cleanupOldMetrics(): Promise<number>;
