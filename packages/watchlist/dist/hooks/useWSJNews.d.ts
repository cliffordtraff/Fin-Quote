import { NewsArticle } from '@watchlist/types';
interface UseWSJNewsOptions {
    symbols: string[];
    enabled?: boolean;
    feedType?: 'markets' | 'business' | 'tech' | 'opinion';
    pollInterval?: number;
}
export declare function useWSJNews({ symbols, enabled, feedType, pollInterval }: UseWSJNewsOptions): {
    news: Record<string, NewsArticle[]>;
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
    stats: {
        totalArticles: number;
        dedupedArticles: number;
        matchedTickers: number;
        totalMatches: number;
    } | undefined;
    getNewsForTicker: (ticker: string) => NewsArticle | null;
    getAllNewsForTicker: (ticker: string) => NewsArticle[];
    getNewsCount: (ticker: string) => number;
    refresh: () => void;
    formatTimeAgo: (date: Date) => string;
};
export {};
