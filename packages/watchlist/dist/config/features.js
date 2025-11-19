var _a;
// Feature flags for controlled rollout of new features
export const features = {
    serviceWorker: process.env.NEXT_PUBLIC_ENABLE_SW === 'true' &&
        process.env.NODE_ENV === 'production',
    // Gradual rollout percentage (once enabled)
    serviceWorkerRolloutPercentage: 100, // Start with 100% in production for testing
    // Macro Attribution Feature (v1.3.0)
    macroAttribution: {
        enabled: process.env.NEXT_PUBLIC_ENABLE_MACRO_ATTRIBUTION !== 'false', // Enabled by default, can be killed
        rolloutPercentage: parseInt(process.env.NEXT_PUBLIC_MACRO_ATTRIBUTION_ROLLOUT || '100', 10),
        allowedSymbols: (_a = process.env.NEXT_PUBLIC_MACRO_ATTRIBUTION_SYMBOLS) === null || _a === void 0 ? void 0 : _a.split(',').map(s => s.trim()),
        description: 'Market context and macro event attribution in AI summaries'
    }
};
// Helper to check if service worker should be enabled for current user
export function shouldEnableServiceWorker() {
    // Production only
    if (process.env.NODE_ENV !== 'production')
        return false;
    // Feature flag check
    if (process.env.NEXT_PUBLIC_ENABLE_SW !== 'true')
        return false;
    // TODO: Add user-based rollout logic here if needed
    // const userId = getUserId()
    // const hash = hashCode(userId)
    // return (hash % 100) < features.serviceWorkerRolloutPercentage
    return true;
}
/**
 * Check if macro attribution is enabled for a given symbol
 *
 * Uses percentage-based rollout with consistent hashing to ensure
 * the same symbol always gets the same treatment.
 *
 * Environment variables:
 * - NEXT_PUBLIC_ENABLE_MACRO_ATTRIBUTION=false : Kill switch (disable immediately)
 * - NEXT_PUBLIC_MACRO_ATTRIBUTION_ROLLOUT=50 : Enable for 50% of symbols
 * - NEXT_PUBLIC_MACRO_ATTRIBUTION_SYMBOLS=AAPL,TSLA : Limit to specific symbols
 */
export function isMacroAttributionEnabled(symbol) {
    const flag = features.macroAttribution;
    // Kill switch check
    if (!flag.enabled) {
        return false;
    }
    // Symbol allowlist check (if configured)
    if (flag.allowedSymbols && flag.allowedSymbols.length > 0) {
        if (!flag.allowedSymbols.includes(symbol.toUpperCase())) {
            return false;
        }
    }
    // Rollout percentage check (consistent hashing)
    if (flag.rolloutPercentage < 100) {
        const bucket = hashSymbolToBucket(symbol);
        return bucket < flag.rolloutPercentage;
    }
    return true;
}
/**
 * Hash symbol to consistent bucket (0-99)
 * Ensures same symbol always gets same treatment across requests
 */
function hashSymbolToBucket(symbol) {
    let hash = 0;
    const str = symbol.toUpperCase();
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100;
}
/**
 * Get feature flag status for admin dashboard
 */
export function getFeatureFlagStatus() {
    return {
        macroAttribution: {
            enabled: features.macroAttribution.enabled,
            rolloutPercentage: features.macroAttribution.rolloutPercentage,
            description: features.macroAttribution.description,
            allowedSymbols: features.macroAttribution.allowedSymbols || null,
            isKillSwitchActive: !features.macroAttribution.enabled
        },
        serviceWorker: {
            enabled: features.serviceWorker,
            rolloutPercentage: features.serviceWorkerRolloutPercentage,
            description: 'Progressive Web App service worker'
        }
    };
}
/**
 * Log feature flag usage for monitoring
 */
export function logFeatureFlagUsage(feature, symbol, enabled) {
    // In production, this would send to monitoring service (Datadog, New Relic, etc.)
    // For now, log to console in development
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Feature Flag] ${feature} for ${symbol}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
}
