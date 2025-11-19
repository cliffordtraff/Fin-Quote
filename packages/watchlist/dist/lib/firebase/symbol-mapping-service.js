var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { collection, doc, getDoc, setDoc, query, where, getDocs, updateDoc, increment, Timestamp, writeBatch, limit, orderBy } from 'firebase/firestore';
import { db } from './config';
const MAPPINGS_COLLECTION = 'symbolMappings';
const USER_OVERRIDES_COLLECTION = 'userSymbolOverrides';
/**
 * Create document key from exchange and symbol
 * Format: {exchange}:{symbol} to prevent collisions
 */
function createDocumentKey(exchange, symbol) {
    return `${exchange}:${symbol}`;
}
/**
 * Normalize exchange name for TradingView compatibility
 * ARCA ETFs use NYSEARCA prefix in TradingView
 */
export function normalizeExchangeForTV(exchange, type) {
    // ARCA ETFs need NYSEARCA prefix in TradingView
    if (exchange === 'ARCA' && type === 'etf') {
        return 'NYSEARCA';
    }
    return exchange;
}
/**
 * Get a symbol mapping by exchange and symbol
 */
export function getSymbolMapping(exchange, symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docKey = createDocumentKey(exchange, symbol);
            const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
            const docSnap = yield getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        }
        catch (error) {
            console.error('Error fetching symbol mapping:', error);
            return null;
        }
    });
}
/**
 * Get a symbol mapping by FMP symbol (tries common exchanges)
 * This is a convenience function for when we only have the symbol
 * Note: NYSEARCA is the TradingView prefix for NYSE ETFs
 */
export function getSymbolMappingByFmpSymbol(fmpSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        // Try common exchanges in order of likelihood
        // Include NYSEARCA for ETFs (maps to ARCA in our storage)
        const commonExchanges = ['NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'NYSEARCA'];
        for (const exchange of commonExchanges) {
            // NYSEARCA is stored as ARCA in our DB but displayed as NYSEARCA in TradingView
            const storageExchange = exchange === 'NYSEARCA' ? 'ARCA' : exchange;
            const mapping = yield getSymbolMapping(storageExchange, fmpSymbol);
            if (mapping) {
                return mapping;
            }
        }
        // If not found in common exchanges, query by fmpSymbol field
        try {
            const q = query(collection(db, MAPPINGS_COLLECTION), where('fmpSymbol', '==', fmpSymbol), where('active', '==', true), limit(1));
            const querySnapshot = yield getDocs(q);
            if (!querySnapshot.empty) {
                return querySnapshot.docs[0].data();
            }
        }
        catch (error) {
            console.error('Error querying symbol mapping:', error);
        }
        return null;
    });
}
/**
 * Get multiple symbol mappings by FMP symbols
 */
export function getSymbolMappings(fmpSymbols) {
    return __awaiter(this, void 0, void 0, function* () {
        const mappings = new Map();
        if (fmpSymbols.length === 0)
            return mappings;
        try {
            // Firestore has a limit of 10 for 'in' queries, so batch if needed
            const chunks = [];
            for (let i = 0; i < fmpSymbols.length; i += 10) {
                chunks.push(fmpSymbols.slice(i, i + 10));
            }
            for (const chunk of chunks) {
                const q = query(collection(db, MAPPINGS_COLLECTION), where('fmpSymbol', 'in', chunk));
                const querySnapshot = yield getDocs(q);
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    mappings.set(data.fmpSymbol, data);
                });
            }
            return mappings;
        }
        catch (error) {
            console.error('Error fetching symbol mappings:', error);
            return mappings;
        }
    });
}
/**
 * Create or update a symbol mapping (server-only)
 * Uses exchange:symbol as document key
 */
export function upsertSymbolMapping(mapping) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docKey = createDocumentKey(mapping.exchange, mapping.fmpSymbol);
            const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
            const existingDoc = yield getDoc(docRef);
            if (existingDoc.exists()) {
                // Update existing, preserve usage count and active status if not provided
                const updates = Object.assign(Object.assign({}, mapping), { lastVerified: Timestamp.now() });
                // Don't overwrite active status unless explicitly set
                if (mapping.active === undefined) {
                    delete updates.active;
                }
                yield updateDoc(docRef, updates);
            }
            else {
                // Create new with defaults
                yield setDoc(docRef, Object.assign(Object.assign({}, mapping), { active: mapping.active !== false, usageCount: 0, lastVerified: Timestamp.now() }));
            }
        }
        catch (error) {
            console.error('Error upserting symbol mapping:', error);
            throw error;
        }
    });
}
/**
 * Batch upsert multiple symbol mappings
 * Chunks into batches of 500 (Firestore limit)
 */
export function batchUpsertSymbolMappings(mappings) {
    return __awaiter(this, void 0, void 0, function* () {
        const BATCH_SIZE = 500; // Firestore batch limit
        let successCount = 0;
        let failedCount = 0;
        try {
            // Process in chunks of 500
            for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
                const chunk = mappings.slice(i, i + BATCH_SIZE);
                const batch = writeBatch(db);
                for (const mapping of chunk) {
                    const docKey = createDocumentKey(mapping.exchange, mapping.fmpSymbol);
                    const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
                    batch.set(docRef, Object.assign(Object.assign({}, mapping), { active: mapping.active !== false, usageCount: 0, lastVerified: Timestamp.now() }), { merge: true });
                }
                try {
                    yield batch.commit();
                    successCount += chunk.length;
                }
                catch (error) {
                    console.error(`Error committing batch ${i / BATCH_SIZE}:`, error);
                    failedCount += chunk.length;
                }
            }
            return { success: successCount, failed: failedCount };
        }
        catch (error) {
            console.error('Error batch upserting symbol mappings:', error);
            throw error;
        }
    });
}
/**
 * Increment usage count for a symbol mapping (atomic operation)
 * This prevents race conditions when multiple users access simultaneously
 */
export function incrementMappingUsage(exchange, symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docKey = createDocumentKey(exchange, symbol);
            const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
            // Use atomic increment to prevent race conditions
            yield updateDoc(docRef, {
                usageCount: increment(1),
                lastUsed: Timestamp.now()
            });
        }
        catch (error) {
            console.error('Error incrementing mapping usage:', error);
            // Don't throw - this is not critical for app functionality
        }
    });
}
/**
 * Increment usage by FMP symbol (tries common exchanges)
 */
export function incrementMappingUsageByFmpSymbol(fmpSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        const mapping = yield getSymbolMappingByFmpSymbol(fmpSymbol);
        if (mapping) {
            yield incrementMappingUsage(mapping.exchange, fmpSymbol);
        }
    });
}
/**
 * Get top N most used symbol mappings
 */
export function getTopUsedMappings() {
    return __awaiter(this, arguments, void 0, function* (n = 20) {
        try {
            const q = query(collection(db, MAPPINGS_COLLECTION), orderBy('usageCount', 'desc'), limit(n));
            const querySnapshot = yield getDocs(q);
            const mappings = [];
            querySnapshot.forEach((doc) => {
                mappings.push(doc.data());
            });
            return mappings;
        }
        catch (error) {
            console.error('Error fetching top used mappings:', error);
            return [];
        }
    });
}
/**
 * Get mappings that need verification
 */
export function getMappingsForVerification() {
    return __awaiter(this, arguments, void 0, function* (minUsageCount = 10) {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const q = query(collection(db, MAPPINGS_COLLECTION), where('usageCount', '>=', minUsageCount), where('confidence', '==', 'unverified'), orderBy('usageCount', 'desc'), limit(10));
            const querySnapshot = yield getDocs(q);
            const mappings = [];
            querySnapshot.forEach((doc) => {
                mappings.push(doc.data());
            });
            return mappings;
        }
        catch (error) {
            console.error('Error fetching mappings for verification:', error);
            return [];
        }
    });
}
/**
 * Mark a mapping as verified
 */
export function markMappingVerified(exchange, symbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docKey = createDocumentKey(exchange, symbol);
            const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
            yield updateDoc(docRef, {
                confidence: 'verified',
                lastVerified: Timestamp.now(),
                active: true // Verified mappings are active
            });
        }
        catch (error) {
            console.error('Error marking mapping as verified:', error);
            throw error;
        }
    });
}
/**
 * Mark a mapping as inactive (for delisted symbols)
 */
export function markMappingInactive(exchange, symbol, supersededBy) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docKey = createDocumentKey(exchange, symbol);
            const docRef = doc(db, MAPPINGS_COLLECTION, docKey);
            const updates = {
                active: false,
                lastVerified: Timestamp.now()
            };
            if (supersededBy) {
                updates.supersededBy = supersededBy;
            }
            yield updateDoc(docRef, updates);
        }
        catch (error) {
            console.error('Error marking mapping as inactive:', error);
            throw error;
        }
    });
}
/**
 * Get user-specific symbol override
 */
export function getUserSymbolOverride(userId, fmpSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docId = `${userId}_${fmpSymbol}`;
            const docRef = doc(db, USER_OVERRIDES_COLLECTION, docId);
            const docSnap = yield getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
            return null;
        }
        catch (error) {
            console.error('Error fetching user symbol override:', error);
            return null;
        }
    });
}
/**
 * Set user-specific symbol override
 */
export function setUserSymbolOverride(userId, fmpSymbol, tvSymbol) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const docId = `${userId}_${fmpSymbol}`;
            const docRef = doc(db, USER_OVERRIDES_COLLECTION, docId);
            yield setDoc(docRef, {
                userId,
                fmpSymbol,
                tvSymbol,
                createdAt: Timestamp.now()
            });
        }
        catch (error) {
            console.error('Error setting user symbol override:', error);
            throw error;
        }
    });
}
