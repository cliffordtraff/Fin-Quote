import { NewsArticle } from '@watchlist/types';
export declare class NewsMatchingEngine {
    private normalizeText;
    private generateMatchReason;
    private containsExactTicker;
    private extractUrlSlug;
    private checkUrlForCompany;
    private findExactMatches;
    private calculateContextBoost;
    private matchArticleToTicker;
    matchArticles(articles: NewsArticle[], tickers: string[]): Map<string, NewsArticle[]>;
    deduplicateArticles(articles: NewsArticle[]): NewsArticle[];
    rankArticles(articles: NewsArticle[]): NewsArticle[];
}
