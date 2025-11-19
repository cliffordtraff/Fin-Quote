import { ExtendedHoursQuote } from '@watchlist/types';
interface UseExtendedHoursDataResult {
    data: Map<string, ExtendedHoursQuote>;
    isLoading: boolean;
    error: string | null;
}
/**
 * Hook to fetch extended hours data for symbols
 * Only fetches when enabled and during extended hours sessions
 * Polls every 1 minute during extended hours
 */
export declare function useExtendedHoursData(symbols: string[], enabled: boolean): UseExtendedHoursDataResult;
export {};
