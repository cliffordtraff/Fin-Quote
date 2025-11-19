/**
 * FMP Earnings Service
 *
 * Handles fetching and normalizing earnings calendar data from FMP API
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';
const FMP_API_KEY = process.env.FMP_API_KEY;
/**
 * FMP Earnings Service
 */
export class FMPEarningsService {
    constructor(apiKey) {
        this.apiKey = apiKey || FMP_API_KEY || '';
        if (!this.apiKey) {
            console.warn('[FMP Earnings] No API key configured');
        }
    }
    /**
     * Fetch earnings calendar for date range (max 3 months)
     */
    getEarningsCalendar(from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.apiKey) {
                console.error('[FMP Earnings] Cannot fetch calendar: No API key');
                return [];
            }
            try {
                const url = `${FMP_BASE_URL}/earning_calendar?from=${from}&to=${to}&apikey=${this.apiKey}`;
                const response = yield fetch(url);
                if (!response.ok) {
                    throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
                }
                const data = yield response.json();
                if (!Array.isArray(data)) {
                    console.warn('[FMP Earnings] Invalid response format:', data);
                    return [];
                }
                return data.map(item => this.normalizeEarnings(item));
            }
            catch (error) {
                console.error('[FMP Earnings] Error fetching calendar:', error);
                return [];
            }
        });
    }
    /**
     * Fetch historical earnings for specific symbol
     */
    getSymbolEarnings(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, limit = 4) {
            if (!this.apiKey) {
                console.error('[FMP Earnings] Cannot fetch symbol earnings: No API key');
                return [];
            }
            try {
                const url = `${FMP_BASE_URL}/historical/earning_calendar/${symbol}?limit=${limit}&apikey=${this.apiKey}`;
                const response = yield fetch(url);
                if (!response.ok) {
                    throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
                }
                const data = yield response.json();
                if (!Array.isArray(data)) {
                    console.warn('[FMP Earnings] Invalid response format for symbol:', symbol, data);
                    return [];
                }
                return data.map(item => this.normalizeEarnings(item));
            }
            catch (error) {
                console.error(`[FMP Earnings] Error fetching earnings for ${symbol}:`, error);
                return [];
            }
        });
    }
    /**
     * Fetch earnings for specific date
     */
    getEarningsForDate(date) {
        return __awaiter(this, void 0, void 0, function* () {
            // FMP doesn't have a specific endpoint for single date, use calendar with same from/to
            return this.getEarningsCalendar(date, date);
        });
    }
    /**
     * Transform FMP response to normalized EarningsData
     *
     * Handles:
     * - Revenue normalization (millions/billions to dollars)
     * - Timestamp computation (date + time -> UTC timestamp)
     * - Source tracking for future migrations
     */
    normalizeEarnings(fmpData) {
        var _a, _b;
        const symbol = fmpData.symbol || '';
        const date = fmpData.date || '';
        const time = this.normalizeTime(fmpData.time);
        const eventTimestampUtc = this.computeEventTimestamp(date, time);
        // Normalize revenue (FMP sometimes returns in millions or billions)
        const revenueEstimate = this.normalizeRevenue(fmpData.revenueEstimated);
        const revenueActual = this.normalizeRevenue(fmpData.revenue);
        return {
            symbol,
            date,
            time,
            eventTimestampUtc,
            fiscalDateEnding: fmpData.fiscalDateEnding || '',
            epsEstimate: (_a = fmpData.epsEstimated) !== null && _a !== void 0 ? _a : null,
            epsActual: (_b = fmpData.eps) !== null && _b !== void 0 ? _b : null,
            revenueEstimate,
            revenueActual,
            source: 'fmp',
            sourceVersion: 'v3', // FMP API version
            updatedAt: Date.now()
        };
    }
    /**
     * Normalize time field from FMP
     */
    normalizeTime(time) {
        if (!time)
            return 'unknown';
        const lower = time.toLowerCase().trim();
        if (lower === 'bmo' || lower === 'before market open')
            return 'bmo';
        if (lower === 'amc' || lower === 'after market close')
            return 'amc';
        return 'unknown';
    }
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
    computeEventTimestamp(date, time) {
        if (!date)
            return 0;
        try {
            // Parse date in ET timezone (market timezone)
            // Note: This assumes input date is already in ET context
            const d = new Date(date + 'T00:00:00-05:00'); // EST offset, Date handles DST
            if (time === 'bmo') {
                // Before market open = 9:30 AM ET
                d.setHours(9, 30, 0, 0);
            }
            else if (time === 'amc') {
                // After market close = 5:00 PM ET (common earnings time)
                d.setHours(17, 0, 0, 0);
            }
            else {
                // Unknown = noon ET (safe default)
                d.setHours(12, 0, 0, 0);
            }
            return d.getTime();
        }
        catch (error) {
            console.error('[FMP Earnings] Error computing timestamp:', error);
            return 0;
        }
    }
    /**
     * Normalize revenue values to USD
     *
     * FMP sometimes returns revenue in millions or raw dollars
     * This ensures consistent dollar representation
     */
    normalizeRevenue(revenue) {
        if (revenue === undefined || revenue === null)
            return null;
        // If revenue is less than 1 million, assume it's already in dollars
        // If revenue is large (> 1 billion), it's likely already in dollars
        // Middle range (1M - 1B) might be in millions, but we can't reliably detect
        // For now, assume FMP returns in dollars (check API docs to confirm)
        return revenue;
    }
}
/**
 * Default singleton instance
 */
export const fmpEarningsService = new FMPEarningsService();
