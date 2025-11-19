export interface Stock {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    bid: number;
    ask: number;
    bidSize: number;
    askSize: number;
    dayLow: number;
    dayHigh: number;
    weekLow52: number;
    weekHigh52: number;
    marketCap: number;
    peRatio: number | null;
    eps: number | null;
    dividendYield: number | null;
    exDividendDate: string | null;
    lastUpdated?: Date;
    extendedHoursQuote?: ExtendedHoursQuote | null;
}
export interface ExtendedHoursQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    timestamp: string;
    session: 'pre-market' | 'after-hours';
}
export interface MergedStock extends Stock {
    dividendYield: number | null;
    exDividendDate: string | null;
    yieldBasis: 'TTM' | 'forward' | 'estimated' | 'unknown';
    dividendDataFresh: boolean;
    news?: NewsArticle | null;
    newsCount?: number;
}
export interface DividendData {
    symbol: string;
    dividendYield: number | null;
    exDividendDate: string | null;
    yieldBasis?: 'TTM' | 'forward' | 'estimated' | 'unknown';
    lastUpdated?: string;
    annualDividend?: number;
    paymentFrequency?: string;
}
export interface NewsArticle {
    id: string;
    headline: string;
    description: string;
    canonicalUrl: string;
    sourceDomain: string;
    source: 'WSJ' | 'NYT' | 'Yahoo' | 'Bloomberg' | 'Reuters';
    isPaywalled: boolean;
    publishedAt: Date;
    normalizedTitle: string;
    normalizedDescription: string;
    entities?: EntityMatch[];
    eventType?: 'earnings' | 'guidance' | 'lawsuit' | 'product' | 'macro';
    clusterId?: string;
    matchedTickers?: TickerMatch[];
    confidence?: number;
    author?: string;
    categories?: string[];
    relevanceScore?: number;
    isArchived?: boolean;
    topics?: string[];
    feedTopic?: string;
    topicsClassified?: boolean;
    classificationMetadata?: TopicClassificationMetadata;
    scope?: 'macro' | 'sector' | 'company' | 'other';
    macroEventType?: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy' | null;
}
export interface TopicClassificationMetadata {
    model: string;
    promptVersion: string;
    classifiedAt: Date;
    idempotencyKey: string;
    confidence?: number;
}
export interface TickerMatch {
    symbol: string;
    confidence: number;
    matchType: 'exact' | 'company' | 'executive' | 'product' | 'context' | 'entity';
    matchedTerms: string[];
    entityConfidence?: number;
    matchReason?: string;
}
export interface EntityMatch {
    text: string;
    type: 'ORG' | 'PERSON' | 'LOCATION' | 'MONEY' | 'DATE' | 'PRODUCT';
    confidence: number;
    symbol?: string;
}
export interface CompanyMapping {
    symbol: string;
    primary: string;
    aliases: string[];
    executives: string[];
    products: string[];
    contextPositive: string[];
    contextNegative: string[];
}
export interface NewsCache {
    articles: NewsArticle[];
    lastUpdated: Date;
    etag?: string;
    lastModified?: string;
}
export interface Watchlist {
    id: string;
    name: string;
    symbols: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface WatchlistSettings {
    showExtendedHours?: boolean;
    columnWidths?: Record<string, number>;
    fontScale?: number;
}
export type WatchlistItemType = 'stock' | 'header';
export interface WatchlistItem {
    type: WatchlistItemType;
    symbol: string;
}
export interface WatchlistStock extends WatchlistItem {
    type: 'stock';
    symbol: string;
    tvSymbol?: string;
    exchange?: string;
    companyName?: string;
    isADR?: boolean;
}
export interface WatchlistHeader extends WatchlistItem {
    type: 'header';
    symbol: string;
    id?: string;
}
export type WatchlistEntry = WatchlistStock | WatchlistHeader;
export interface WatchlistTab {
    name: string;
    symbols?: string[];
    items?: WatchlistEntry[];
}
export interface ApiResponse<T> {
    data?: T;
    error?: string;
    message?: string;
}
export interface QuoteData {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    latestTradingDay: string;
    bid?: number;
    ask?: number;
    bidSize?: number;
    askSize?: number;
    weekHigh52?: number;
    weekLow52?: number;
    marketCap?: number;
}
export interface CompanyData {
    symbol: string;
    name: string;
    description?: string;
    sector?: string;
    industry?: string;
    marketCap?: number;
    peRatio?: number;
    eps?: number;
    dividendYield?: number;
    exDividendDate?: string;
}
export interface UnifiedStockResponse {
    data: {
        quotes?: Record<string, Stock>;
        dividends?: Record<string, DividendData>;
        news?: Record<string, NewsArticle[]>;
        metadata?: Record<string, CompanyData>;
    };
    status: {
        source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed';
        timestamp: string;
        requestedSymbols: string[];
        returnedSymbols: string[];
        errors: string[];
        warnings: string[];
        cacheTTL?: number;
        responseTime?: number;
    };
}
