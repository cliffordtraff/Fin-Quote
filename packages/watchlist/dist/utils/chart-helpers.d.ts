import { CandlestickData, FMPCandleData, Timeframe } from '@watchlist/types/chart';
import { Time } from 'lightweight-charts';
/**
 * Transform FMP candle data to TradingView Lightweight Charts format
 */
export declare function transformFMPToTradingView(fmpData: FMPCandleData[]): CandlestickData[];
/**
 * Get the default lookback period for a given timeframe
 * Returns number of days to look back
 */
export declare function getDefaultLookback(timeframe: Timeframe): number;
/**
 * Calculate the start time of a candle for a given timestamp and timeframe
 */
export declare function calculateCandleTimeframe(timestamp: number, timeframe: Timeframe): number;
/**
 * Merge a real-time quote into an existing candle or create a new one
 * This is used to update the current candle with live price data
 */
export declare function mergeQuoteIntoCandle(currentCandle: CandlestickData | null, quote: {
    price: number;
    volume?: number;
    timestamp?: number;
}, timeframe: Timeframe): CandlestickData;
/**
 * Format timeframe for display
 */
export declare function formatTimeframe(timeframe: Timeframe): string;
/**
 * Get cache TTL for a given timeframe (in seconds)
 */
export declare function getChartCacheTTL(timeframe: Timeframe): number;
/**
 * Calculate Simple Moving Average (SMA) from candlestick data
 *
 * @param data - Array of candlestick data
 * @param period - Number of periods for the moving average (e.g., 20, 50, 200)
 * @returns Array of SMA values with time and value
 */
export declare function calculateSMA(data: CandlestickData[], period: number): Array<{
    time: Time;
    value: number;
}>;
/**
 * Check if a timestamp is during extended hours trading
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns true if extended hours (pre-market or after-hours), false if regular hours
 */
export declare function isExtendedHours(timestamp: number): boolean;
/**
 * Filter chart data to exclude extended hours
 *
 * @param data - Array of candlestick data
 * @returns Filtered array with only regular hours data
 */
export declare function filterRegularHoursOnly(data: CandlestickData[]): CandlestickData[];
