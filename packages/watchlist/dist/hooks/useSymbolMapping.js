var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
// Client-side cache for mappings
const CACHE_KEY_PREFIX = 'symbol_mapping_';
const CACHE_TTL_VERIFIED = 24 * 60 * 60 * 1000; // 24 hours for verified
const CACHE_TTL_UNVERIFIED = 60 * 60 * 1000; // 1 hour for unverified
const MAX_CACHE_SIZE = 100;
// In-memory cache for current session
const memoryCache = new Map();
/**
 * Hook to get and manage symbol mappings
 */
export function useSymbolMapping(fmpSymbol) {
    const { user } = useAuth();
    const [mapping, setMapping] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Get mapping from cache or API
    const getMapping = useCallback((symbol) => __awaiter(this, void 0, void 0, function* () {
        // Check memory cache first
        if (memoryCache.has(symbol)) {
            return memoryCache.get(symbol);
        }
        // Check localStorage cache
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { data, timestamp, ttl } = JSON.parse(cached);
                if (Date.now() - timestamp < ttl) {
                    // Cache is still valid
                    memoryCache.set(symbol, data);
                    return data;
                }
                else {
                    // Cache expired, remove it
                    localStorage.removeItem(cacheKey);
                }
            }
        }
        catch (err) {
            console.error('Error reading cache:', err);
        }
        // Fetch from API
        const response = yield fetch(`/api/symbols/mapping?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) {
            if (response.status === 404) {
                // Mapping not found, return null
                return null;
            }
            throw new Error(`Failed to fetch mapping: ${response.statusText}`);
        }
        const data = yield response.json();
        // Cache the result
        cacheMapping(symbol, data);
        return data;
    }), []);
    // Cache a mapping
    const cacheMapping = useCallback((symbol, data) => {
        // Add to memory cache
        memoryCache.set(symbol, data);
        // Add to localStorage with appropriate TTL
        const ttl = data.confidence === 'verified' ? CACHE_TTL_VERIFIED : CACHE_TTL_UNVERIFIED;
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            ttl
        };
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            // Clean up old cache entries if needed
            cleanupCache();
        }
        catch (err) {
            console.error('Error caching mapping:', err);
        }
    }, []);
    // Clean up old cache entries to stay under limit
    const cleanupCache = useCallback(() => {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX));
            if (keys.length > MAX_CACHE_SIZE) {
                // Sort by timestamp and remove oldest
                const entries = keys.map(key => {
                    try {
                        const item = localStorage.getItem(key);
                        if (!item)
                            return null;
                        const { timestamp } = JSON.parse(item);
                        return { key, timestamp };
                    }
                    catch (_a) {
                        return null;
                    }
                }).filter(Boolean);
                entries.sort((a, b) => a.timestamp - b.timestamp);
                // Remove oldest entries
                const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE + 10);
                toRemove.forEach(({ key }) => localStorage.removeItem(key));
            }
        }
        catch (err) {
            console.error('Error cleaning cache:', err);
        }
    }, []);
    // Create or update a mapping
    const createMapping = useCallback((fmpSymbol_1, tvSymbol_1, exchange_1, name_1, ...args_1) => __awaiter(this, [fmpSymbol_1, tvSymbol_1, exchange_1, name_1, ...args_1], void 0, function* (fmpSymbol, tvSymbol, exchange, name, type = 'stock') {
        const response = yield fetch('/api/symbols/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fmpSymbol,
                tvSymbol,
                exchange,
                name,
                type,
                source: 'automatic',
                confidence: 'unverified'
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to create mapping: ${response.statusText}`);
        }
        // Clear cache for this symbol
        memoryCache.delete(fmpSymbol);
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${fmpSymbol}`);
        return response.json();
    }), []);
    // Report incorrect mapping (user override)
    const reportIncorrectMapping = useCallback((fmpSymbol, correctTvSymbol) => __awaiter(this, void 0, void 0, function* () {
        if (!user) {
            throw new Error('Must be logged in to report incorrect mapping');
        }
        const response = yield fetch('/api/symbols/mapping/correction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.uid,
                fmpSymbol,
                correctTvSymbol
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to report correction: ${response.statusText}`);
        }
        // Clear cache for this symbol
        memoryCache.delete(fmpSymbol);
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${fmpSymbol}`);
        return response.json();
    }), [user]);
    // Effect to load mapping when symbol changes
    useEffect(() => {
        if (!fmpSymbol) {
            setMapping(null);
            setError(null);
            return;
        }
        let cancelled = false;
        const loadMapping = () => __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            setError(null);
            try {
                const result = yield getMapping(fmpSymbol);
                if (!cancelled) {
                    setMapping(result);
                }
            }
            catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load mapping');
                    setMapping(null);
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        });
        loadMapping();
        return () => {
            cancelled = true;
        };
    }, [fmpSymbol, getMapping]);
    return {
        mapping,
        loading,
        error,
        createMapping,
        reportIncorrectMapping,
        refetch: () => fmpSymbol && getMapping(fmpSymbol)
    };
}
/**
 * Hook to get multiple symbol mappings at once
 */
export function useSymbolMappings(fmpSymbols) {
    const [mappings, setMappings] = useState(new Map());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (fmpSymbols.length === 0) {
            setMappings(new Map());
            return;
        }
        let cancelled = false;
        const loadMappings = () => __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            setError(null);
            try {
                // Check cache first
                const uncachedSymbols = [];
                const cachedMappings = new Map();
                for (const symbol of fmpSymbols) {
                    // Check memory cache
                    if (memoryCache.has(symbol)) {
                        cachedMappings.set(symbol, memoryCache.get(symbol));
                        continue;
                    }
                    // Check localStorage cache
                    try {
                        const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
                        const cached = localStorage.getItem(cacheKey);
                        if (cached) {
                            const { data, timestamp, ttl } = JSON.parse(cached);
                            if (Date.now() - timestamp < ttl) {
                                cachedMappings.set(symbol, data);
                                memoryCache.set(symbol, data);
                                continue;
                            }
                        }
                    }
                    catch (_a) { }
                    uncachedSymbols.push(symbol);
                }
                // Fetch uncached symbols
                if (uncachedSymbols.length > 0) {
                    const response = yield fetch(`/api/symbols/mapping/batch?symbols=${uncachedSymbols.join(',')}`);
                    if (response.ok) {
                        const { mappings: fetchedMappings } = yield response.json();
                        // Cache and merge results
                        for (const [symbol, mapping] of Object.entries(fetchedMappings)) {
                            cachedMappings.set(symbol, mapping);
                            // Cache for future use
                            const ttl = mapping.confidence === 'verified'
                                ? CACHE_TTL_VERIFIED
                                : CACHE_TTL_UNVERIFIED;
                            const cacheEntry = {
                                data: mapping,
                                timestamp: Date.now(),
                                ttl
                            };
                            try {
                                const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
                                localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
                                memoryCache.set(symbol, mapping);
                            }
                            catch (_b) { }
                        }
                    }
                }
                if (!cancelled) {
                    setMappings(cachedMappings);
                }
            }
            catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load mappings');
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        });
        loadMappings();
        return () => {
            cancelled = true;
        };
    }, [fmpSymbols.join(',')]); // Use joined string as dependency
    return { mappings, loading, error };
}
