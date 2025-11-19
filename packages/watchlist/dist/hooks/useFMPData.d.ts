import { Stock } from '@watchlist/types';
interface UseFMPDataOptions {
    symbols: string[];
    visibleSymbols?: string[];
    pollInterval?: number;
    enabled?: boolean;
}
export declare function useFMPData({ symbols, visibleSymbols, // New optional parameter
pollInterval, enabled }: UseFMPDataOptions): {
    stockData: Map<string, Stock>;
    isLoading: boolean;
    error: string | null;
    isConnected: boolean;
    marketStatus: import("@watchlist/utils/marketHours").MarketStatus;
    dataSource: "live" | "cached" | "mock" | "error" | "firestore-cache" | "stale-cache" | "mixed";
    lastUpdated: string | null;
    refresh: () => void;
};
export {};
