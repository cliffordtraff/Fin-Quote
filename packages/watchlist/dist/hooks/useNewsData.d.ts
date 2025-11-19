interface NewsMeta {
    hasNews: boolean;
    count: number;
    latestPublishedAt?: string;
    latestTitle?: string;
}
interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary: string;
}
interface NewsData {
    [symbol: string]: NewsMeta;
}
interface UseNewsDataOptions {
    visibleSymbols: string[];
    enabled?: boolean;
}
export declare function useNewsData({ visibleSymbols, enabled }: UseNewsDataOptions): {
    newsData: NewsData;
    loading: boolean;
    fetchArticles: (symbol: string) => Promise<NewsArticle[]>;
    prefetchArticles: (symbol: string) => Promise<void>;
    refetch: () => any;
};
export {};
