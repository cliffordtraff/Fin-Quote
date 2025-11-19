import { EventEmitter } from 'events';
import { Stock, NewsArticle } from '@watchlist/types';
interface FMPServiceConfig {
    apiKey: string;
    wsUrl?: string;
    enableWebSocket?: boolean;
}
export declare class FMPService extends EventEmitter {
    private wsManager;
    private restClient;
    private stockDataCache;
    private config;
    private pollingIntervals;
    constructor(config: FMPServiceConfig);
    private setupWebSocketListeners;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribeToSymbols(symbols: string[]): Promise<void>;
    unsubscribeFromSymbols(symbols: string[]): Promise<void>;
    private fetchFullStockData;
    fetchBatchStockData(symbols: string[]): Promise<Map<string, Stock>>;
    private startPollingForSymbols;
    private pollSymbol;
    private isIndex;
    getStock(symbol: string): Stock | undefined;
    getAllStocks(): Map<string, Stock>;
    getStockNews(symbol: string, limit?: number): Promise<NewsArticle[]>;
    searchSymbols(query: string): Promise<any[]>;
    getExtendedHoursQuote(symbol: string): Promise<any | null>;
    getBatchExtendedHoursQuotes(symbols: string[]): Promise<Map<string, any>>;
    isConnected(): boolean;
}
export {};
