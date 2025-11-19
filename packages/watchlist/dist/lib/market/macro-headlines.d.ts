/**
 * Macro Headlines Query Service
 *
 * Fetches and processes macro news articles for attribution:
 * - Queries newsArchive for scope='macro' articles
 * - Filters by market session date
 * - Groups and deduplicates similar events
 * - Returns structured macro event data
 */
export interface MacroEvent {
    type: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy';
    headlines: string[];
    sources: string[];
    publishedAt: Date;
    articleIds: string[];
}
export interface MacroHeadlinesResult {
    events: MacroEvent[];
    totalArticles: number;
    sessionDate: Date;
    fetchedAt: Date;
}
/**
 * Fetch today's macro headlines from newsArchive
 * Groups similar articles into events
 */
export declare function getTodaysMacroHeadlines(sessionDate?: Date, maxArticles?: number): Promise<MacroHeadlinesResult>;
/**
 * Format macro event for prompt injection
 * Returns concise summary suitable for LLM context
 */
export declare function formatMacroEventForPrompt(event: MacroEvent): string;
/**
 * Summarize all macro events into compact prompt text
 * Limits output to top N most important events
 */
export declare function summarizeMacroEventsForPrompt(events: MacroEvent[], maxEvents?: number): string;
/**
 * Check if any high-impact macro events exist
 * High-impact = trade_tariff, fed_policy, geopolitical, financial_stress
 */
export declare function hasHighImpactMacroEvents(events: MacroEvent[]): boolean;
