var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { db } from './admin';
/**
 * Check if a symbol is cryptocurrency
 */
function isCrypto(symbol) {
    return symbol.includes('-USD') || symbol.includes('BTC') || symbol.includes('ETH');
}
/**
 * Save pre-market extended hours data to cache
 */
export function savePreMarketCache(symbol, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCrypto(symbol)) {
            console.log(`[ExtHoursCache] Skipping crypto symbol: ${symbol}`);
            return;
        }
        const cacheRef = db.collection('extendedHoursCache').doc(symbol);
        const cacheData = {
            preMarket: {
                price: data.price,
                change: data.change,
                changePercent: data.changePercent,
                timestamp: data.timestamp
            },
            updatedAt: new Date().toISOString()
        };
        yield cacheRef.set(cacheData, { merge: true });
        console.log(`[ExtHoursCache] Saved pre-market data for ${symbol}: $${data.price}`);
    });
}
/**
 * Save after-hours extended hours data to cache
 */
export function saveAfterHoursCache(symbol, data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCrypto(symbol)) {
            console.log(`[ExtHoursCache] Skipping crypto symbol: ${symbol}`);
            return;
        }
        const cacheRef = db.collection('extendedHoursCache').doc(symbol);
        const cacheData = {
            afterHours: {
                price: data.price,
                change: data.change,
                changePercent: data.changePercent,
                timestamp: data.timestamp
            },
            updatedAt: new Date().toISOString()
        };
        yield cacheRef.set(cacheData, { merge: true });
        console.log(`[ExtHoursCache] Saved after-hours data for ${symbol}: $${data.price}`);
    });
}
/**
 * Get cached extended hours data for a symbol
 */
export function getCachedExtendedHours(symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isCrypto(symbol)) {
            return null; // Don't use cache for crypto
        }
        const cacheRef = db.collection('extendedHoursCache').doc(symbol);
        const doc = yield cacheRef.get();
        if (!doc.exists) {
            return null;
        }
        return doc.data();
    });
}
/**
 * Batch save pre-market data for multiple symbols
 */
export function batchSavePreMarket(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const batch = db.batch();
        let count = 0;
        for (const [symbol, quote] of data.entries()) {
            if (isCrypto(symbol)) {
                continue;
            }
            const cacheRef = db.collection('extendedHoursCache').doc(symbol);
            batch.set(cacheRef, {
                preMarket: {
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    timestamp: quote.timestamp
                },
                updatedAt: new Date().toISOString()
            }, { merge: true });
            count++;
        }
        if (count > 0) {
            yield batch.commit();
            console.log(`[ExtHoursCache] Batch saved pre-market data for ${count} symbols`);
        }
    });
}
/**
 * Batch save after-hours data for multiple symbols
 */
export function batchSaveAfterHours(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const batch = db.batch();
        let count = 0;
        for (const [symbol, quote] of data.entries()) {
            if (isCrypto(symbol)) {
                continue;
            }
            const cacheRef = db.collection('extendedHoursCache').doc(symbol);
            batch.set(cacheRef, {
                afterHours: {
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    timestamp: quote.timestamp
                },
                updatedAt: new Date().toISOString()
            }, { merge: true });
            count++;
        }
        if (count > 0) {
            yield batch.commit();
            console.log(`[ExtHoursCache] Batch saved after-hours data for ${count} symbols`);
        }
    });
}
