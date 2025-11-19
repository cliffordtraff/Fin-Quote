import { MergedStock } from '@watchlist/types';
interface UseMergedStockDataOptions {
    symbols: string[];
    visibleSymbols?: string[];
    enabled?: boolean;
    enableNews?: boolean;
    showExtendedHours?: boolean;
}
export declare function useMergedStockData({ symbols, visibleSymbols, // Pass through to useFMPData
enabled, enableNews, showExtendedHours }: UseMergedStockDataOptions): {
    stockData: Map<string, MergedStock>;
    isLoading: boolean;
    isPriceLoading: boolean;
    isDividendLoading: boolean;
    isNewsLoading: boolean;
    error: string | null;
    isConnected: boolean;
    marketStatus: import("../utils/marketHours").MarketStatus;
    dataSource: "live" | "cached" | "mock" | "error" | "firestore-cache" | "stale-cache" | "mixed";
    lastUpdated: string | null;
    refresh: () => void;
    formatTimeAgo: (date: Date) => string;
};
export {};
