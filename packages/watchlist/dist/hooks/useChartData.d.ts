import { CandlestickData, Timeframe } from '@watchlist/types/chart';
interface UseChartDataReturn {
    data: CandlestickData[];
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}
/**
 * Hook to fetch and manage chart data for a symbol
 *
 * @param symbol - Stock symbol to fetch data for
 * @param timeframe - Chart timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)
 * @param enabled - Whether to fetch data (default: true)
 */
export declare function useChartData(symbol: string, timeframe?: Timeframe, enabled?: boolean): UseChartDataReturn;
export {};
