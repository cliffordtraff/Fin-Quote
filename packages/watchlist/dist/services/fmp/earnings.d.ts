/**
 * FMP Earnings Service
 *
 * Handles fetching and normalizing earnings calendar data from FMP API
 */
import { EarningsData } from '@watchlist/types/earnings';
/**
 * FMP Earnings Service
 */
export declare class FMPEarningsService {
    private apiKey;
    constructor(apiKey?: string);
    /**
     * Fetch earnings calendar for date range (max 3 months)
     */
    getEarningsCalendar(from: string, to: string): Promise<EarningsData[]>;
    /**
     * Fetch historical earnings for specific symbol
     */
    getSymbolEarnings(symbol: string, limit?: number): Promise<EarningsData[]>;
    /**
     * Fetch earnings for specific date
     */
    getEarningsForDate(date: string): Promise<EarningsData[]>;
    /**
     * Transform FMP response to normalized EarningsData
     *
     * Handles:
     * - Revenue normalization (millions/billions to dollars)
     * - Timestamp computation (date + time -> UTC timestamp)
     * - Source tracking for future migrations
     */
    private normalizeEarnings;
    /**
     * Normalize time field from FMP
     */
    private normalizeTime;
    /**
     * Compute canonical event timestamp in UTC
     *
     * Maps:
     * - bmo -> 9:30 AM ET (market open)
     * - amc -> 5:00 PM ET (typical after-hours time)
     * - unknown -> 12:00 PM ET (noon, safe default)
     *
     * Handles DST automatically via JavaScript Date
     */
    private computeEventTimestamp;
    /**
     * Normalize revenue values to USD
     *
     * FMP sometimes returns revenue in millions or raw dollars
     * This ensures consistent dollar representation
     */
    private normalizeRevenue;
}
/**
 * Default singleton instance
 */
export declare const fmpEarningsService: FMPEarningsService;
