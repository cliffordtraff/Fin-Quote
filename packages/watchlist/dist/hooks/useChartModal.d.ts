import { Timeframe } from '@watchlist/types/chart';
interface UseChartModalReturn {
    isOpen: boolean;
    symbol: string | null;
    timeframe: Timeframe;
    openChart: (symbol: string, timeframe?: Timeframe) => void;
    closeChart: () => void;
    setTimeframe: (timeframe: Timeframe) => void;
}
/**
 * Hook to manage chart modal state
 *
 * Provides functions to open/close the chart modal and manage selected symbol
 */
export declare function useChartModal(): UseChartModalReturn;
export {};
