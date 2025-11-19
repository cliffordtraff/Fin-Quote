/**
 * Market Context Service
 *
 * Provides market-wide context for attribution:
 * - Benchmark returns (SPY, QQQ)
 * - Market session timing
 * - Volatility estimates
 *
 * Caches benchmark data in Firestore to minimize API calls.
 */
export interface BenchmarkReturns {
    SPY: {
        return: number;
        close: number;
        open: number;
        date: string;
    };
    QQQ: {
        return: number;
        close: number;
        open: number;
        date: string;
    };
    fetchedAt: Date;
    source: 'live' | 'cached' | 'fallback';
}
/**
 * Get benchmark returns for a specific date
 * Uses Firestore cache with 24h TTL
 */
export declare function getBenchmarkReturns(date?: Date): Promise<BenchmarkReturns | null>;
/**
 * Get market session date for a given timestamp
 * Uses Eastern Time (US market hours)
 */
export declare function getMarketSessionDate(timestamp?: Date): Date;
/**
 * Determine which benchmark best explains a stock's move
 * For tech-heavy stocks, prefer QQQ; otherwise SPY
 */
export declare function selectBenchmark(symbol: string, benchmarks: BenchmarkReturns): 'SPY' | 'QQQ';
/**
 * Calculate if stock move is aligned with market
 * Returns true if stock and benchmark moved in same direction
 */
export declare function isAlignedWithMarket(stockReturn: number, benchmarkReturn: number, threshold?: number): boolean;
/**
 * Calculate absolute difference between stock and benchmark return
 */
export declare function calculateReturnDifference(stockReturn: number, benchmarkReturn: number): number;
/**
 * Format return as percentage string
 */
export declare function formatReturn(returnValue: number): string;
