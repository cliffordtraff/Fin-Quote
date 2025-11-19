interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary: string;
}
declare class NewsStorageService {
    private db;
    private dbPromise;
    private initDB;
    storeArticles(symbol: string, articles: NewsArticle[]): Promise<void>;
    getArticles(symbol: string): Promise<NewsArticle[] | null>;
    hasArticles(symbol: string): Promise<boolean>;
    getArticleAge(symbol: string): Promise<number | null>;
    pruneOldArticles(): Promise<number>;
    getStorageInfo(): Promise<{
        usage: number;
        quota: number;
    } | null>;
    clearAll(): Promise<void>;
    getStoredSymbols(): Promise<string[]>;
}
export declare const newsStorage: NewsStorageService;
export {};
