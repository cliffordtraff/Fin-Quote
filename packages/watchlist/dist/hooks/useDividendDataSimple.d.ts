import { DividendData } from '@watchlist/types';
export declare function useDividendDataSimple(symbols: string[]): {
    dividendData: Map<string, DividendData>;
    isLoading: boolean;
    error: string | null;
};
