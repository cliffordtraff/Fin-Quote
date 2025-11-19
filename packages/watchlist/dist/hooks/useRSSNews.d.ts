import { NewsArticle } from '@watchlist/types';
interface RSSNewsMeta {
    symbol: string;
    articles: NewsArticle[];
    count: number;
    latestArticle?: NewsArticle;
}
interface UseRSSNewsOptions {
    visibleSymbols: string[];
    enabled?: boolean;
}
export declare function useRSSNews({ visibleSymbols, enabled }: UseRSSNewsOptions): {
    rssNewsData: Record<string, RSSNewsMeta>;
    loading: boolean;
    fetchArticlesForSymbol: (symbol: string) => Promise<NewsArticle[]>;
    prefetchArticles: (symbol: string) => void;
    refetch: () => any;
};
export {};
