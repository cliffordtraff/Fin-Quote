import { NewsArticle } from '@watchlist/types';
export declare class NewsArchiveService {
    private static instance;
    private collectionName;
    static getInstance(): NewsArchiveService;
    /**
     * Archive a new article
     */
    archiveArticle(article: NewsArticle): Promise<void>;
    /**
     * Check if an article already exists in the archive
     */
    articleExists(url: string): Promise<boolean>;
    /**
     * Get archived articles by ticker
     */
    getArticlesByTicker(ticker: string, daysBack?: number, maxResults?: number): Promise<NewsArticle[]>;
    /**
     * Get archived articles by source
     */
    getArticlesBySource(source: string, daysBack?: number, maxResults?: number): Promise<NewsArticle[]>;
    /**
     * Get all archived articles within a date range
     */
    getArchivedArticles(daysBack?: number, sources?: string[], maxResults?: number): Promise<NewsArticle[]>;
    /**
     * Clean up articles older than the retention period
     */
    cleanupOldArticles(retentionDays?: number): Promise<number>;
    /**
     * Private helper methods
     */
    private generateArticleId;
    private hashUrl;
    private addToTickerIndex;
    private addToSourceIndex;
    private getArticleById;
    private convertToNewsArticle;
}
export declare const newsArchiveService: NewsArchiveService;
