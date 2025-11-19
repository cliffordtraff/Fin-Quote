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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@watchlist/lib/firebase/config';
/**
 * Get benchmark returns for a specific date
 * Uses Firestore cache with 24h TTL
 */
export function getBenchmarkReturns() {
    return __awaiter(this, arguments, void 0, function* (date = new Date()) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        try {
            // Try cache first
            const cached = yield getCachedBenchmarks(dateStr);
            if (cached) {
                return cached;
            }
            // Fetch live data
            const live = yield fetchLiveBenchmarks(date);
            if (live) {
                // Cache for 24 hours
                yield cacheBenchmarks(dateStr, live);
                return live;
            }
            // Try stale cache as fallback
            const stale = yield getCachedBenchmarks(dateStr, true);
            if (stale) {
                console.warn('Using stale benchmark cache');
                return Object.assign(Object.assign({}, stale), { source: 'fallback' });
            }
            return null;
        }
        catch (error) {
            console.error('Error fetching benchmark returns:', error);
            // Try stale cache on error
            const stale = yield getCachedBenchmarks(dateStr, true);
            if (stale) {
                console.warn('Using stale benchmark cache due to error');
                return Object.assign(Object.assign({}, stale), { source: 'fallback' });
            }
            return null;
        }
    });
}
/**
 * Fetch live benchmark data from FMP API
 */
function fetchLiveBenchmarks(date) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const apiKey = process.env.FMP_API_KEY;
        if (!apiKey) {
            console.warn('FMP_API_KEY not set, cannot fetch benchmark data');
            return null;
        }
        try {
            const dateStr = date.toISOString().split('T')[0];
            // Fetch SPY and QQQ historical data
            const [spyResponse, qqqResponse] = yield Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/SPY?from=${dateStr}&to=${dateStr}&apikey=${apiKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/QQQ?from=${dateStr}&to=${dateStr}&apikey=${apiKey}`)
            ]);
            if (!spyResponse.ok || !qqqResponse.ok) {
                console.error('FMP API error:', spyResponse.status, qqqResponse.status);
                return null;
            }
            const spyData = yield spyResponse.json();
            const qqqData = yield qqqResponse.json();
            // Extract daily data
            const spyBar = (_a = spyData.historical) === null || _a === void 0 ? void 0 : _a[0];
            const qqqBar = (_b = qqqData.historical) === null || _b === void 0 ? void 0 : _b[0];
            if (!spyBar || !qqqBar) {
                console.warn('No benchmark data available for date:', dateStr);
                return null;
            }
            // Calculate returns
            const spyReturn = (spyBar.close - spyBar.open) / spyBar.open;
            const qqqReturn = (qqqBar.close - qqqBar.open) / qqqBar.open;
            return {
                SPY: {
                    return: spyReturn,
                    close: spyBar.close,
                    open: spyBar.open,
                    date: spyBar.date
                },
                QQQ: {
                    return: qqqReturn,
                    close: qqqBar.close,
                    open: qqqBar.open,
                    date: qqqBar.date
                },
                fetchedAt: new Date(),
                source: 'live'
            };
        }
        catch (error) {
            console.error('Error fetching live benchmarks:', error);
            return null;
        }
    });
}
/**
 * Get cached benchmark data from Firestore
 */
function getCachedBenchmarks(dateStr_1) {
    return __awaiter(this, arguments, void 0, function* (dateStr, allowStale = false) {
        try {
            const cacheRef = doc(db, 'marketContext', `benchmarks_${dateStr}`);
            const cacheSnap = yield getDoc(cacheRef);
            if (!cacheSnap.exists()) {
                return null;
            }
            const cached = cacheSnap.data();
            // Check expiry unless allowing stale
            if (!allowStale) {
                const now = Timestamp.now();
                if (cached.expiresAt.toMillis() < now.toMillis()) {
                    return null; // Expired
                }
            }
            return {
                SPY: cached.SPY,
                QQQ: cached.QQQ,
                fetchedAt: cached.fetchedAt.toDate(),
                source: 'cached'
            };
        }
        catch (error) {
            console.error('Error reading benchmark cache:', error);
            return null;
        }
    });
}
/**
 * Cache benchmark data in Firestore
 */
function cacheBenchmarks(dateStr, benchmarks) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cacheRef = doc(db, 'marketContext', `benchmarks_${dateStr}`);
            const now = Timestamp.now();
            const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24h TTL
            const cached = {
                SPY: benchmarks.SPY,
                QQQ: benchmarks.QQQ,
                fetchedAt: Timestamp.fromDate(benchmarks.fetchedAt),
                expiresAt
            };
            yield setDoc(cacheRef, cached);
        }
        catch (error) {
            console.error('Error caching benchmarks:', error);
            // Non-fatal, continue without cache
        }
    });
}
/**
 * Get market session date for a given timestamp
 * Uses Eastern Time (US market hours)
 */
export function getMarketSessionDate(timestamp = new Date()) {
    // Convert to ET (UTC-5 or UTC-4 depending on DST)
    // For simplicity, use UTC-5 (can enhance with DST detection if needed)
    const etOffset = -5 * 60 * 60 * 1000;
    const etTime = new Date(timestamp.getTime() + etOffset);
    // If before 4am ET, consider it previous day's session
    if (etTime.getUTCHours() < 4) {
        etTime.setUTCDate(etTime.getUTCDate() - 1);
    }
    // Return date at midnight ET
    etTime.setUTCHours(0, 0, 0, 0);
    return etTime;
}
/**
 * Determine which benchmark best explains a stock's move
 * For tech-heavy stocks, prefer QQQ; otherwise SPY
 */
export function selectBenchmark(symbol, benchmarks) {
    // Tech-heavy symbols that correlate more with QQQ
    const techHeavy = [
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
        'NFLX', 'ADBE', 'CRM', 'INTC', 'AMD', 'AVGO', 'QCOM', 'TXN',
        'ORCL', 'CSCO', 'INTU', 'AMAT', 'MU', 'LRCX', 'KLAC', 'SNPS'
    ];
    return techHeavy.includes(symbol.toUpperCase()) ? 'QQQ' : 'SPY';
}
/**
 * Calculate if stock move is aligned with market
 * Returns true if stock and benchmark moved in same direction
 */
export function isAlignedWithMarket(stockReturn, benchmarkReturn, threshold = 0.001 // 0.1% threshold for "flat"
) {
    // If both are essentially flat, consider aligned
    if (Math.abs(stockReturn) < threshold && Math.abs(benchmarkReturn) < threshold) {
        return true;
    }
    // Check if same direction
    return (stockReturn > 0 && benchmarkReturn > 0) || (stockReturn < 0 && benchmarkReturn < 0);
}
/**
 * Calculate absolute difference between stock and benchmark return
 */
export function calculateReturnDifference(stockReturn, benchmarkReturn) {
    return Math.abs(stockReturn - benchmarkReturn);
}
/**
 * Format return as percentage string
 */
export function formatReturn(returnValue) {
    const percentage = returnValue * 100;
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
}
