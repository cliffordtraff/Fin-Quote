import { DividendData } from '@watchlist/types';
export declare function useDividendData(symbols: string[]): {
    dividendData: Map<string, DividendData>;
    isLoading: boolean;
    error: string | null;
};
