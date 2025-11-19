/**
 * News Source Configuration
 * Manages quality filtering and prioritization of news sources
 */
export declare const BLOCKED_NEWS_SOURCES: readonly ["247wallst.com", "fool.com", "fxempire.com", "finbold.com", "seeitmarket.com", "proactiveinvestors.com"];
export declare const TIER_1_SOURCES: readonly ["reuters.com", "wsj.com", "cnbc.com", "bloomberg.com", "ft.com", "barrons.com", "forbes.com"];
export declare const TIER_2_SOURCES: readonly ["marketwatch.com", "businessinsider.com", "seekingalpha.com", "investors.com", "yahoo.com", "thestreet.com"];
export declare const PRESS_RELEASE_SOURCES: readonly ["prnewswire.com", "businesswire.com", "globenewswire.com", "accesswire.com"];
export declare function normalizeDomain(url: string): string;
export declare function isBlockedSource(source: string): boolean;
export declare function getSourceTier(source: string): 'tier1' | 'tier2' | 'press' | 'blocked' | 'unknown';
export declare function sortBySourceQuality<T extends {
    site?: string;
}>(articles: T[]): T[];
export type NewsSource = typeof BLOCKED_NEWS_SOURCES[number] | typeof TIER_1_SOURCES[number] | typeof TIER_2_SOURCES[number] | typeof PRESS_RELEASE_SOURCES[number];
export type SourceTier = ReturnType<typeof getSourceTier>;
