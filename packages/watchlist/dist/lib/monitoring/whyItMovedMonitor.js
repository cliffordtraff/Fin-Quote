/**
 * Runtime Monitoring for "Why It Moved" AI Summaries
 *
 * Logs metrics on every request and provides automatic rollback triggers
 * when quality degrades below acceptable thresholds.
 */
// Configuration
const ROLLBACK_THRESHOLDS = {
    validationPassRate: 85, // Rollback if < 85%
    retryRate: 15, // Rollback if > 15%
    fallbackRate: 5, // Rollback if > 5%
    p95LatencyMs: 5000 // Rollback if > 5 seconds
};
const MONITORING_WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window
const MIN_SAMPLES_FOR_ROLLBACK = 20; // Need 20+ requests before triggering rollback
// In-memory metrics store (could be persisted to Firestore in production)
const metricsLog = [];
const MAX_LOG_SIZE = 10000; // Keep last 10k requests
/**
 * Log a summary request with all metrics
 */
export function logSummaryMetrics(metrics) {
    var _a;
    metricsLog.push(metrics);
    // Trim log if too large
    if (metricsLog.length > MAX_LOG_SIZE) {
        metricsLog.shift();
    }
    // Log to console for visibility
    const status = metrics.usedFallback ? '🔴 FALLBACK' :
        metrics.retried ? '🟡 RETRIED' :
            metrics.validationPassed ? '🟢 PASSED' : '❌ FAILED';
    console.log(`[AI Summary] ${status}`, {
        symbol: metrics.symbol,
        version: metrics.promptVersion,
        latency: `${metrics.latencyMs}ms`,
        errors: ((_a = metrics.validationErrors) === null || _a === void 0 ? void 0 : _a.length) || 0
    });
    // Persist to Firestore (async, non-blocking)
    if (typeof window === 'undefined') {
        // Only on server-side
        import('@watchlist/lib/firebase/metrics-service')
            .then(({ saveMetric }) => saveMetric(metrics))
            .catch((error) => {
            console.error('[Monitoring] Failed to persist metric:', error);
        });
    }
}
/**
 * Get aggregated metrics for a time window
 */
export function getAggregatedMetrics(windowMs = MONITORING_WINDOW_MS) {
    var _a;
    const now = Date.now();
    const windowStart = now - windowMs;
    // Filter to window
    const windowMetrics = metricsLog.filter(m => m.timestamp >= windowStart);
    if (windowMetrics.length === 0) {
        return {
            windowStart,
            windowEnd: now,
            totalRequests: 0,
            validationPassRate: 100,
            retryRate: 0,
            fallbackRate: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            promptVersion: 'N/A'
        };
    }
    // Calculate success rates
    const validationPassed = windowMetrics.filter(m => m.validationPassed && !m.retried).length;
    const retried = windowMetrics.filter(m => m.retried).length;
    const fallback = windowMetrics.filter(m => m.usedFallback).length;
    const validationPassRate = (validationPassed / windowMetrics.length) * 100;
    const retryRate = (retried / windowMetrics.length) * 100;
    const fallbackRate = (fallback / windowMetrics.length) * 100;
    // Calculate latency percentiles
    const latencies = windowMetrics.map(m => m.latencyMs).sort((a, b) => a - b);
    const p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] || 0;
    // Get most recent prompt version
    const promptVersion = ((_a = windowMetrics[windowMetrics.length - 1]) === null || _a === void 0 ? void 0 : _a.promptVersion) || 'N/A';
    return {
        windowStart,
        windowEnd: now,
        totalRequests: windowMetrics.length,
        validationPassRate,
        retryRate,
        fallbackRate,
        p50LatencyMs,
        p95LatencyMs,
        p99LatencyMs,
        promptVersion
    };
}
/**
 * Check if any rollback triggers have been activated
 */
export function checkRollbackTriggers() {
    const triggers = [];
    // Need minimum samples to avoid false positives
    const metrics = getAggregatedMetrics();
    if (metrics.totalRequests < MIN_SAMPLES_FOR_ROLLBACK) {
        return [];
    }
    // Check validation pass rate
    if (metrics.validationPassRate < ROLLBACK_THRESHOLDS.validationPassRate) {
        triggers.push({
            triggered: true,
            reason: 'Validation pass rate below threshold',
            metric: 'validationPassRate',
            actualValue: metrics.validationPassRate,
            threshold: ROLLBACK_THRESHOLDS.validationPassRate,
            timestamp: Date.now()
        });
    }
    // Check retry rate
    if (metrics.retryRate > ROLLBACK_THRESHOLDS.retryRate) {
        triggers.push({
            triggered: true,
            reason: 'Retry rate above threshold',
            metric: 'retryRate',
            actualValue: metrics.retryRate,
            threshold: ROLLBACK_THRESHOLDS.retryRate,
            timestamp: Date.now()
        });
    }
    // Check fallback rate
    if (metrics.fallbackRate > ROLLBACK_THRESHOLDS.fallbackRate) {
        triggers.push({
            triggered: true,
            reason: 'Fallback rate above threshold',
            metric: 'fallbackRate',
            actualValue: metrics.fallbackRate,
            threshold: ROLLBACK_THRESHOLDS.fallbackRate,
            timestamp: Date.now()
        });
    }
    // Check P95 latency
    if (metrics.p95LatencyMs > ROLLBACK_THRESHOLDS.p95LatencyMs) {
        triggers.push({
            triggered: true,
            reason: 'P95 latency above threshold',
            metric: 'p95LatencyMs',
            actualValue: metrics.p95LatencyMs,
            threshold: ROLLBACK_THRESHOLDS.p95LatencyMs,
            timestamp: Date.now()
        });
    }
    return triggers;
}
/**
 * Get recent validation failures for debugging
 */
export function getRecentFailures(limit = 10) {
    return metricsLog
        .filter(m => !m.validationPassed || m.usedFallback)
        .slice(-limit)
        .reverse();
}
/**
 * Reset metrics (for testing or after rollback)
 */
export function resetMetrics() {
    metricsLog.length = 0;
    console.log('[Monitoring] Metrics reset');
}
/**
 * Export metrics for analysis
 */
export function exportMetrics() {
    return [...metricsLog];
}
