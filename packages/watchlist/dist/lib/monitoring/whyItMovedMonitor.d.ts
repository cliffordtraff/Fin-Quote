/**
 * Runtime Monitoring for "Why It Moved" AI Summaries
 *
 * Logs metrics on every request and provides automatic rollback triggers
 * when quality degrades below acceptable thresholds.
 */
export interface SummaryMetrics {
    symbol: string;
    timestamp: number;
    promptVersion: string;
    rulesVersion?: string;
    validationPassed: boolean;
    retried: boolean;
    usedFallback: boolean;
    latencyMs: number;
    validationErrors?: string[];
    validationWarnings?: string[];
    model: string;
    tokensUsed?: number;
}
export interface AggregatedMetrics {
    windowStart: number;
    windowEnd: number;
    totalRequests: number;
    validationPassRate: number;
    retryRate: number;
    fallbackRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    promptVersion: string;
}
export interface RollbackTrigger {
    triggered: boolean;
    reason: string;
    metric: string;
    actualValue: number;
    threshold: number;
    timestamp: number;
}
/**
 * Log a summary request with all metrics
 */
export declare function logSummaryMetrics(metrics: SummaryMetrics): void;
/**
 * Get aggregated metrics for a time window
 */
export declare function getAggregatedMetrics(windowMs?: number): AggregatedMetrics;
/**
 * Check if any rollback triggers have been activated
 */
export declare function checkRollbackTriggers(): RollbackTrigger[];
/**
 * Get recent validation failures for debugging
 */
export declare function getRecentFailures(limit?: number): SummaryMetrics[];
/**
 * Reset metrics (for testing or after rollback)
 */
export declare function resetMetrics(): void;
/**
 * Export metrics for analysis
 */
export declare function exportMetrics(): SummaryMetrics[];
