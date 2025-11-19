export declare const features: {
    serviceWorker: boolean;
    serviceWorkerRolloutPercentage: number;
    macroAttribution: {
        enabled: boolean;
        rolloutPercentage: number;
        allowedSymbols: string[] | undefined;
        description: string;
    };
};
export declare function shouldEnableServiceWorker(): boolean;
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
export declare function isMacroAttributionEnabled(symbol: string): boolean;
/**
 * Get feature flag status for admin dashboard
 */
export declare function getFeatureFlagStatus(): {
    macroAttribution: {
        enabled: boolean;
        rolloutPercentage: number;
        description: string;
        allowedSymbols: string[] | null;
        isKillSwitchActive: boolean;
    };
    serviceWorker: {
        enabled: boolean;
        rolloutPercentage: number;
        description: string;
    };
};
/**
 * Log feature flag usage for monitoring
 */
export declare function logFeatureFlagUsage(feature: 'macroAttribution' | 'serviceWorker', symbol: string, enabled: boolean): void;
