/**
 * Company Data Service
 *
 * Fetches and caches company profiles from FMP API with intelligent
 * batching, caching, and fallback strategies.
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
import { db } from '@watchlist/lib/firebase/config';
import { doc, getDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { apiLimiter } from './api-limiter';
export class CompanyDataService {
    constructor() {
        // Cache configuration
        this.CACHE_TTL = {
            conservative: 30 * 24 * 60 * 60, // 30 days for rarely changing data
            normal: 7 * 24 * 60 * 60, // 7 days default
            aggressive: 24 * 60 * 60 // 1 day for fresh data
        };
        // Batch configuration
        this.BATCH_SIZES = {
            conservative: 10,
            normal: 25,
            aggressive: 50
        };
        // In-memory LRU cache
        this.memoryCache = new Map();
        this.MAX_MEMORY_CACHE_SIZE = 100;
        this.MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }
    static getInstance() {
        if (!CompanyDataService.instance) {
            CompanyDataService.instance = new CompanyDataService();
        }
        return CompanyDataService.instance;
    }
    /**
     * Fetch company profiles for given symbols
     */
    fetchCompanyProfiles(symbols_1) {
        return __awaiter(this, arguments, void 0, function* (symbols, strategy = {}) {
            var _a;
            const fetchStrategy = {
                mode: strategy.mode || 'normal',
                batchSize: strategy.batchSize || this.BATCH_SIZES.normal,
                cacheTTL: strategy.cacheTTL || this.CACHE_TTL.normal,
                fallbackToManual: (_a = strategy.fallbackToManual) !== null && _a !== void 0 ? _a : true
            };
            const profiles = new Map();
            // Step 1: Check memory cache
            const uncachedSymbols = [];
            for (const symbol of symbols) {
                const cached = this.getFromMemoryCache(symbol);
                if (cached) {
                    profiles.set(symbol, cached);
                }
                else {
                    uncachedSymbols.push(symbol);
                }
            }
            if (uncachedSymbols.length === 0) {
                return profiles;
            }
            // Step 2: Check Firestore cache
            const firestoreProfiles = yield this.getFromFirestoreCache(uncachedSymbols, fetchStrategy.cacheTTL);
            for (const [symbol, profile] of firestoreProfiles) {
                profiles.set(symbol, profile);
                this.addToMemoryCache(symbol, profile);
            }
            // Step 3: Identify symbols that need fresh data
            const symbolsNeedingFetch = uncachedSymbols.filter(s => !firestoreProfiles.has(s));
            if (symbolsNeedingFetch.length === 0) {
                return profiles;
            }
            // Step 4: Fetch from FMP API in batches
            const freshProfiles = yield this.fetchFromFMP(symbolsNeedingFetch, fetchStrategy);
            for (const [symbol, profile] of freshProfiles) {
                profiles.set(symbol, profile);
                this.addToMemoryCache(symbol, profile);
            }
            // Step 5: Cache fresh data in Firestore
            if (freshProfiles.size > 0) {
                yield this.saveToFirestoreCache(freshProfiles, fetchStrategy.cacheTTL);
            }
            // Step 6: Fallback to manual mappings if enabled
            if (fetchStrategy.fallbackToManual) {
                const stillMissing = symbolsNeedingFetch.filter(s => !freshProfiles.has(s));
                if (stillMissing.length > 0) {
                    const manualProfiles = yield this.getManualMappings(stillMissing);
                    for (const [symbol, profile] of manualProfiles) {
                        profiles.set(symbol, profile);
                    }
                }
            }
            return profiles;
        });
    }
    /**
     * Get from memory cache
     */
    getFromMemoryCache(symbol) {
        const cached = this.memoryCache.get(symbol);
        if (cached) {
            // Simple LRU: move to end when accessed
            this.memoryCache.delete(symbol);
            this.memoryCache.set(symbol, cached);
            return cached;
        }
        return null;
    }
    /**
     * Add to memory cache with LRU eviction
     */
    addToMemoryCache(symbol, profile) {
        // Remove oldest if at capacity
        if (this.memoryCache.size >= this.MAX_MEMORY_CACHE_SIZE) {
            const firstKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(firstKey);
        }
        this.memoryCache.set(symbol, profile);
    }
    /**
     * Get profiles from Firestore cache
     */
    getFromFirestoreCache(symbols, ttl) {
        return __awaiter(this, void 0, void 0, function* () {
            const profiles = new Map();
            try {
                // Batch get documents
                const promises = symbols.map((symbol) => __awaiter(this, void 0, void 0, function* () {
                    const docRef = doc(db, 'companies', symbol);
                    const docSnap = yield getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const age = Date.now() - data.cachedAt.toMillis();
                        // Check if cache is still valid
                        if (age < ttl * 1000) {
                            const profile = Object.assign(Object.assign({}, data), { lastVerified: data.cachedAt.toDate() });
                            return { symbol, profile };
                        }
                    }
                    return null;
                }));
                const results = yield Promise.all(promises);
                for (const result of results) {
                    if (result) {
                        profiles.set(result.symbol, result.profile);
                    }
                }
            }
            catch (error) {
                console.error('Error fetching from Firestore cache:', error);
            }
            return profiles;
        });
    }
    /**
     * Save profiles to Firestore cache
     */
    saveToFirestoreCache(profiles, ttl) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const batch = writeBatch(db);
                for (const [symbol, profile] of profiles) {
                    const docRef = doc(db, 'companies', symbol);
                    const cachedProfile = Object.assign(Object.assign({}, profile), { cachedAt: Timestamp.now(), ttl });
                    batch.set(docRef, cachedProfile, { merge: true });
                }
                yield batch.commit();
                console.log(`Cached ${profiles.size} company profiles to Firestore`);
            }
            catch (error) {
                console.error('Error saving to Firestore cache:', error);
            }
        });
    }
    /**
     * Fetch profiles from FMP API
     */
    fetchFromFMP(symbols, strategy) {
        return __awaiter(this, void 0, void 0, function* () {
            const profiles = new Map();
            if (!process.env.FMP_API_KEY) {
                console.warn('FMP_API_KEY not configured, skipping API fetch');
                return profiles;
            }
            // Split into batches
            const batches = [];
            for (let i = 0; i < symbols.length; i += strategy.batchSize) {
                batches.push(symbols.slice(i, i + strategy.batchSize));
            }
            console.log(`Fetching ${symbols.length} company profiles in ${batches.length} batches`);
            // Process batches with rate limiting
            for (const batch of batches) {
                try {
                    const data = yield apiLimiter.queueRequest('company/profile', () => __awaiter(this, void 0, void 0, function* () {
                        const response = yield fetch(`https://financialmodelingprep.com/api/v3/profile/${batch.join(',')}?apikey=${process.env.FMP_API_KEY}`);
                        if (!response.ok) {
                            throw new Error(`FMP API error: ${response.status}`);
                        }
                        return response.json();
                    }), strategy.mode === 'aggressive' ? 'high' : 'normal');
                    // Process response
                    if (Array.isArray(data)) {
                        for (const company of data) {
                            const profile = {
                                symbol: company.symbol,
                                companyName: company.companyName,
                                exchange: company.exchange,
                                industry: company.industry,
                                website: company.website,
                                description: company.description,
                                ceo: company.ceo,
                                sector: company.sector,
                                country: company.country,
                                employees: company.fullTimeEmployees,
                                isPrivate: company.isEtf || company.isActivelyTrading === false,
                                lastVerified: new Date(),
                                dataSource: 'fmp',
                                commonNames: this.generateNameVariations(company.companyName),
                                aliases: this.extractAliases(company.description)
                            };
                            profiles.set(company.symbol, profile);
                        }
                    }
                }
                catch (error) {
                    console.error(`Failed to fetch batch [${batch.join(', ')}]:`, error);
                    // Continue with other batches
                }
            }
            return profiles;
        });
    }
    /**
     * Generate common name variations
     */
    generateNameVariations(companyName) {
        const variations = new Set();
        variations.add(companyName);
        // Remove common suffixes
        const suffixes = [' Inc.', ' Inc', ' Corporation', ' Corp.', ' Corp', ' Ltd.', ' Ltd', ' LLC', ' PLC', ' AG', ' SA', ' NV'];
        let baseName = companyName;
        for (const suffix of suffixes) {
            if (companyName.endsWith(suffix)) {
                baseName = companyName.slice(0, -suffix.length).trim();
                variations.add(baseName);
                break;
            }
        }
        // Handle "The" prefix
        if (baseName.startsWith('The ')) {
            variations.add(baseName.slice(4));
        }
        else if (!companyName.startsWith('The ')) {
            variations.add('The ' + baseName);
        }
        // Add acronym if multi-word
        const words = baseName.split(' ');
        if (words.length > 1 && words.length <= 4) {
            const acronym = words.map(w => w[0]).join('').toUpperCase();
            if (acronym.length > 1) {
                variations.add(acronym);
            }
        }
        return Array.from(variations);
    }
    /**
     * Extract potential aliases from description
     */
    extractAliases(description) {
        if (!description)
            return [];
        const aliases = [];
        // Look for patterns like "formerly known as" or "also known as"
        const patterns = [
            /formerly known as ([^,\.]+)/i,
            /also known as ([^,\.]+)/i,
            /previously ([^,\.]+)/i,
            /dba ([^,\.]+)/i
        ];
        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                aliases.push(match[1].trim());
            }
        }
        return aliases;
    }
    /**
     * Get manual mappings (fallback)
     */
    getManualMappings(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const profiles = new Map();
            // Import existing manual mappings
            try {
                const { companyMappings } = yield import('@watchlist/lib/data/company-mappings');
                for (const symbol of symbols) {
                    const mapping = companyMappings[symbol];
                    if (mapping) {
                        const profile = {
                            symbol,
                            companyName: mapping.primary,
                            lastVerified: new Date(),
                            dataSource: 'manual',
                            commonNames: [...mapping.aliases],
                            aliases: mapping.aliases,
                            ceo: (_a = mapping.executives) === null || _a === void 0 ? void 0 : _a[0],
                            sector: (_b = mapping.contextPositive) === null || _b === void 0 ? void 0 : _b[0] // Best guess
                        };
                        profiles.set(symbol, profile);
                    }
                }
            }
            catch (error) {
                console.error('Failed to load manual mappings:', error);
            }
            return profiles;
        });
    }
    /**
     * Get a single company profile
     */
    getCompanyProfile(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            const profiles = yield this.fetchCompanyProfiles([symbol]);
            return profiles.get(symbol) || null;
        });
    }
    /**
     * Pre-warm cache with most popular symbols
     */
    prewarmCache(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Pre-warming cache with ${symbols.length} symbols`);
            yield this.fetchCompanyProfiles(symbols, {
                mode: 'conservative',
                batchSize: 50,
                cacheTTL: this.CACHE_TTL.conservative
            });
        });
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.memoryCache.clear();
        console.log('Memory cache cleared');
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            memoryCacheSize: this.memoryCache.size,
            memoryCacheMaxSize: this.MAX_MEMORY_CACHE_SIZE,
            apiLimiterStats: apiLimiter.getUsageStats()
        };
    }
}
// Export singleton instance
export const companyDataService = CompanyDataService.getInstance();
