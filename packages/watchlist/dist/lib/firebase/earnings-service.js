/**
 * Firestore Earnings Service
 *
 * Handles caching and retrieval of earnings data from Firestore
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
import { db } from './config';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
const EARNINGS_COLLECTION = 'earnings';
const CALENDAR_COLLECTION = 'earningsCalendar';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Firestore Earnings Service
 */
export class EarningsService {
    /**
     * Cache earnings data for a symbol (with denormalized fields)
     */
    cacheEarnings(symbol, earningsData) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!symbol || earningsData.length === 0)
                return;
            try {
                const now = Date.now();
                const ttl = now + CACHE_TTL;
                // Separate upcoming and recent earnings
                const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now);
                const recent = earningsData
                    .filter(e => new Date(e.date).getTime() < now)
                    .slice(0, 4); // Keep last 4 quarters only
                // Precompute denormalized fields
                const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(upcoming, recent[0] // most recent past earnings
                );
                const cacheDoc = {
                    symbol,
                    upcoming: upcoming || null,
                    recent,
                    status,
                    daysAway,
                    daysSince,
                    eventTimestampUtc,
                    cachedAt: now,
                    ttl
                };
                const docRef = doc(db, EARNINGS_COLLECTION, symbol);
                yield setDoc(docRef, cacheDoc);
                console.log(`[Earnings Service] Cached earnings for ${symbol}:`, {
                    status,
                    daysAway,
                    daysSince
                });
            }
            catch (error) {
                console.error(`[Earnings Service] Error caching earnings for ${symbol}:`, error);
            }
        });
    }
    /**
     * Get cached earnings for symbol
     */
    getEarnings(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!symbol)
                return null;
            try {
                const docRef = doc(db, EARNINGS_COLLECTION, symbol);
                const docSnap = yield getDoc(docRef);
                if (!docSnap.exists()) {
                    return null;
                }
                const data = docSnap.data();
                // Check if cache is fresh
                if (Date.now() > data.ttl) {
                    console.log(`[Earnings Service] Cache expired for ${symbol}`);
                    return null;
                }
                return data;
            }
            catch (error) {
                console.error(`[Earnings Service] Error getting earnings for ${symbol}:`, error);
                return null;
            }
        });
    }
    /**
     * Batch get earnings for multiple symbols (reduce round-trips)
     */
    getBatchEarnings(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const results = new Map();
            if (symbols.length === 0)
                return results;
            try {
                // Firestore batch get (parallel reads)
                const promises = symbols.map(symbol => this.getEarnings(symbol).then(cache => ({ symbol, cache })));
                const allResults = yield Promise.all(promises);
                for (const { symbol, cache } of allResults) {
                    if (cache) {
                        // Convert cache to context
                        results.set(symbol, {
                            status: cache.status,
                            daysAway: (_a = cache.daysAway) !== null && _a !== void 0 ? _a : undefined,
                            daysSince: (_b = cache.daysSince) !== null && _b !== void 0 ? _b : undefined,
                            lastEarnings: cache.recent[0],
                            nextEarnings: (_c = cache.upcoming) !== null && _c !== void 0 ? _c : undefined,
                            impactConfidence: 0 // Will be calculated by confidence calculator
                        });
                    }
                }
                console.log(`[Earnings Service] Batch fetched ${results.size}/${symbols.length} symbols`);
            }
            catch (error) {
                console.error('[Earnings Service] Error in batch fetch:', error);
            }
            return results;
        });
    }
    /**
     * Check if cache is fresh
     */
    isCacheFresh(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            const cache = yield this.getEarnings(symbol);
            return cache !== null;
        });
    }
    /**
     * Batch update earnings for multiple symbols
     */
    batchCacheEarnings(earningsMap) {
        return __awaiter(this, void 0, void 0, function* () {
            if (earningsMap.size === 0)
                return;
            try {
                const batch = writeBatch(db);
                const now = Date.now();
                const ttl = now + CACHE_TTL;
                let count = 0;
                for (const [symbol, earningsData] of earningsMap.entries()) {
                    if (earningsData.length === 0)
                        continue;
                    const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now);
                    const recent = earningsData
                        .filter(e => new Date(e.date).getTime() < now)
                        .slice(0, 4);
                    const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(upcoming, recent[0]);
                    const cacheDoc = {
                        symbol,
                        upcoming: upcoming || null,
                        recent,
                        status,
                        daysAway,
                        daysSince,
                        eventTimestampUtc,
                        cachedAt: now,
                        ttl
                    };
                    const docRef = doc(db, EARNINGS_COLLECTION, symbol);
                    batch.set(docRef, cacheDoc);
                    count++;
                    // Firestore batch limit is 500 operations
                    if (count >= 500) {
                        yield batch.commit();
                        console.log(`[Earnings Service] Committed batch of ${count} symbols`);
                        count = 0;
                    }
                }
                // Commit remaining
                if (count > 0) {
                    yield batch.commit();
                    console.log(`[Earnings Service] Committed final batch of ${count} symbols`);
                }
                console.log(`[Earnings Service] Batch cached ${earningsMap.size} symbols`);
            }
            catch (error) {
                console.error('[Earnings Service] Error in batch cache:', error);
            }
        });
    }
    /**
     * Cache earnings calendar for a date
     */
    cacheCalendar(date, symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const now = Date.now();
                const ttl = now + CACHE_TTL;
                const calendarDoc = {
                    date,
                    symbols,
                    cachedAt: now,
                    ttl
                };
                const docRef = doc(db, CALENDAR_COLLECTION, date);
                yield setDoc(docRef, calendarDoc);
                console.log(`[Earnings Service] Cached calendar for ${date}: ${symbols.length} symbols`);
            }
            catch (error) {
                console.error(`[Earnings Service] Error caching calendar for ${date}:`, error);
            }
        });
    }
    /**
     * Compute status and denormalized fields from earnings data
     */
    computeStatus(upcoming, recent) {
        const now = Date.now();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        // Check upcoming earnings
        if (upcoming) {
            const earningsTime = upcoming.eventTimestampUtc;
            const diffMs = earningsTime - now;
            const diffDays = Math.floor(diffMs / MS_PER_DAY);
            // Is it today?
            if (diffDays === 0) {
                // Distinguish BMO vs AMC
                const status = upcoming.time === 'bmo' ? 'today_bmo' : 'today_amc';
                return {
                    status,
                    daysAway: 0,
                    daysSince: null,
                    eventTimestampUtc: earningsTime
                };
            }
            // Is it upcoming (1-7 days)?
            if (diffDays > 0 && diffDays <= 7) {
                return {
                    status: 'upcoming',
                    daysAway: diffDays,
                    daysSince: null,
                    eventTimestampUtc: earningsTime
                };
            }
        }
        // Check recent earnings
        if (recent) {
            const earningsTime = recent.eventTimestampUtc;
            const diffMs = now - earningsTime;
            const diffDays = Math.floor(diffMs / MS_PER_DAY);
            // Is it recent (1-7 days ago)?
            if (diffDays >= 0 && diffDays <= 7) {
                return {
                    status: 'recent',
                    daysAway: null,
                    daysSince: diffDays,
                    eventTimestampUtc: earningsTime
                };
            }
        }
        // No earnings nearby
        return {
            status: 'none',
            daysAway: null,
            daysSince: null,
            eventTimestampUtc: (upcoming === null || upcoming === void 0 ? void 0 : upcoming.eventTimestampUtc) || (recent === null || recent === void 0 ? void 0 : recent.eventTimestampUtc) || null
        };
    }
}
/**
 * Default singleton instance
 */
export const earningsService = new EarningsService();
