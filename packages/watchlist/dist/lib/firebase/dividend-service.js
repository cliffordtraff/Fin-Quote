var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
export class DividendService {
    /**
     * Get dividend data from Firestore cache
     * Returns null if not found or if data is stale
     */
    static getDividendData(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log(`[DividendService] Fetching dividend data for ${symbol}`);
                const dividendRef = doc(db, 'dividends', symbol);
                const dividendDoc = yield getDoc(dividendRef);
                if (!dividendDoc.exists()) {
                    console.log(`[DividendService] No dividend data found for ${symbol}`);
                    return null;
                }
                const data = dividendDoc.data();
                console.log(`[DividendService] Found dividend data for ${symbol}:`, data);
                // Check if data is stale (older than 7 days)
                const lastUpdated = (_a = data.lastUpdated) === null || _a === void 0 ? void 0 : _a.toDate();
                if (!lastUpdated) {
                    console.log(`[DividendService] No lastUpdated timestamp for ${symbol}`);
                    return null;
                }
                const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate > this.CACHE_DURATION_DAYS) {
                    console.log(`[DividendService] Dividend data for ${symbol} is stale (${daysSinceUpdate.toFixed(1)} days old)`);
                    return null;
                }
                console.log(`[DividendService] Dividend data for ${symbol} is fresh (${daysSinceUpdate.toFixed(1)} days old)`);
                return data;
            }
            catch (error) {
                console.error(`[DividendService] Error getting dividend data for ${symbol}:`, error);
                return null;
            }
        });
    }
    /**
     * Save dividend data to Firestore cache
     */
    static saveDividendData(symbol, exDate, paymentDate, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dividendRef = doc(db, 'dividends', symbol);
                console.log(`[DividendService] Attempting to save dividend data for ${symbol}:`, {
                    exDate,
                    paymentDate,
                    amount
                });
                yield setDoc(dividendRef, {
                    exDate,
                    paymentDate,
                    amount,
                    lastUpdated: serverTimestamp()
                });
                console.log(`[DividendService] Successfully saved dividend data for ${symbol}`);
            }
            catch (error) {
                console.error(`[DividendService] Error saving dividend data for ${symbol}:`, error);
                throw error; // Re-throw to let caller handle
            }
        });
    }
    /**
     * Get dividend data for multiple symbols
     * Returns a map of symbol -> dividend data
     */
    static getBatchDividendData(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = new Map();
            // Fetch all symbols in parallel
            const promises = symbols.map((symbol) => __awaiter(this, void 0, void 0, function* () {
                const data = yield this.getDividendData(symbol);
                if (data) {
                    results.set(symbol, data);
                }
            }));
            yield Promise.all(promises);
            return results;
        });
    }
}
DividendService.CACHE_DURATION_DAYS = 7;
