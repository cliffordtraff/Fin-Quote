import { Timestamp } from 'firebase/firestore';
export interface DividendData {
    exDate: string | null;
    paymentDate: string | null;
    amount: number | null;
    lastUpdated: Timestamp;
}
export declare class DividendService {
    private static CACHE_DURATION_DAYS;
    /**
     * Get dividend data from Firestore cache
     * Returns null if not found or if data is stale
     */
    static getDividendData(symbol: string): Promise<DividendData | null>;
    /**
     * Save dividend data to Firestore cache
     */
    static saveDividendData(symbol: string, exDate: string | null, paymentDate: string | null, amount: number | null): Promise<void>;
    /**
     * Get dividend data for multiple symbols
     * Returns a map of symbol -> dividend data
     */
    static getBatchDividendData(symbols: string[]): Promise<Map<string, DividendData>>;
}
