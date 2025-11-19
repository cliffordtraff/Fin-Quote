var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash';
// Cache analyst data in localStorage with 30-minute TTL
const CACHE_KEY_PREFIX = 'analyst_meta_';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
function getCachedMeta(symbol) {
    try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${symbol}`);
        if (!cached)
            return null;
        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        if (age > CACHE_TTL) {
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${symbol}`);
            return null;
        }
        return data.meta;
    }
    catch (_a) {
        return null;
    }
}
function setCachedMeta(symbol, meta) {
    try {
        localStorage.setItem(`${CACHE_KEY_PREFIX}${symbol}`, JSON.stringify({
            meta,
            timestamp: Date.now()
        }));
    }
    catch (error) {
        console.warn('Failed to cache analyst meta:', error);
    }
}
export function useAnalystData({ visibleSymbols, enabled = true }) {
    const [analystData, setAnalystData] = useState({});
    const [loading, setLoading] = useState(false);
    const fetchInProgress = useRef(false);
    const recentlyFetched = useRef(new Set());
    // Load ALL cached data on mount for instant rendering
    useEffect(() => {
        const loadAllCachedData = () => {
            const cachedData = {};
            // Load all cached analyst meta from localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key === null || key === void 0 ? void 0 : key.startsWith(CACHE_KEY_PREFIX)) {
                    const symbol = key.replace(CACHE_KEY_PREFIX, '');
                    const cached = getCachedMeta(symbol);
                    if (cached) {
                        cachedData[symbol] = cached;
                    }
                }
            }
            if (Object.keys(cachedData).length > 0) {
                setAnalystData(cachedData);
            }
        };
        // Load all cached data immediately
        loadAllCachedData();
    }, []); // Only on mount
    // Load cached data for newly visible symbols
    useEffect(() => {
        const cachedData = {};
        let hasCached = false;
        visibleSymbols.forEach(symbol => {
            // Only load if we don't already have it
            if (!analystData[symbol]) {
                const cached = getCachedMeta(symbol);
                if (cached) {
                    cachedData[symbol] = cached;
                    hasCached = true;
                }
            }
        });
        if (hasCached) {
            setAnalystData(prev => (Object.assign(Object.assign({}, prev), cachedData)));
        }
    }, [visibleSymbols]);
    // Debounced fetch function with improved batching
    const fetchAnalystMeta = useCallback(debounce((symbols) => __awaiter(this, void 0, void 0, function* () {
        if (!enabled || fetchInProgress.current || symbols.length === 0)
            return;
        // Filter out symbols we've recently fetched or have fresh cache
        const symbolsToFetch = symbols.filter(s => {
            // Skip if recently fetched
            if (recentlyFetched.current.has(s))
                return false;
            // Skip if we have fresh cache
            const cached = getCachedMeta(s);
            if (cached)
                return false;
            return true;
        });
        if (symbolsToFetch.length === 0)
            return;
        fetchInProgress.current = true;
        setLoading(true);
        try {
            // Improved batching for large watchlists
            const BATCH_SIZE = 50;
            const MAX_CONCURRENT_BATCHES = 2;
            const batches = [];
            for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
                batches.push(symbolsToFetch.slice(i, i + BATCH_SIZE));
            }
            // Process batches with concurrency limit for better performance
            const results = [];
            for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
                const currentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
                const batchPromises = currentBatches.map((batch) => __awaiter(this, void 0, void 0, function* () {
                    const response = yield fetch(`/api/analyst/upgrades-downgrades?symbols=${batch.join(',')}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            console.warn('[watchlist] Analyst API unavailable (404)');
                            return {};
                        }
                        console.warn('Failed to fetch analyst meta:', response.status);
                        return {};
                    }
                    return response.json();
                }));
                const batchResults = yield Promise.all(batchPromises);
                results.push(...batchResults);
            }
            const combinedData = Object.assign({}, ...results);
            // Cache the results and update state
            Object.entries(combinedData).forEach(([symbol, meta]) => {
                setCachedMeta(symbol, meta);
                recentlyFetched.current.add(symbol);
            });
            setAnalystData(prev => (Object.assign(Object.assign({}, prev), combinedData)));
            // Clear recently fetched after 15 minutes
            setTimeout(() => {
                symbolsToFetch.forEach(s => recentlyFetched.current.delete(s));
            }, 15 * 60 * 1000);
        }
        catch (error) {
            console.warn('[watchlist] Error fetching analyst meta, keeping cached data', error);
        }
        finally {
            fetchInProgress.current = false;
            setLoading(false);
        }
    }), 200), // 200ms debounce for analyst data
    [enabled]);
    // Fetch meta for visible symbols with stale-while-revalidate
    useEffect(() => {
        if (!enabled || visibleSymbols.length === 0)
            return;
        const symbolsNeedingFetch = [];
        const staleSymbols = [];
        visibleSymbols.forEach(symbol => {
            const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${symbol}`);
            if (!cached) {
                // No cache - need immediate fetch
                symbolsNeedingFetch.push(symbol);
            }
            else {
                try {
                    const data = JSON.parse(cached);
                    const age = Date.now() - data.timestamp;
                    // If stale (>15 minutes but <30 minutes), add to background refresh
                    if (age > 15 * 60 * 1000 && age < CACHE_TTL) {
                        staleSymbols.push(symbol);
                    }
                }
                catch (_a) {
                    symbolsNeedingFetch.push(symbol);
                }
            }
        });
        // Fetch uncached symbols immediately
        if (symbolsNeedingFetch.length > 0) {
            fetchAnalystMeta(symbolsNeedingFetch);
        }
        // Refresh stale symbols in background (lower priority)
        if (staleSymbols.length > 0) {
            setTimeout(() => {
                fetchAnalystMeta(staleSymbols);
            }, 2000); // Delay background refresh
        }
    }, [visibleSymbols, enabled, fetchAnalystMeta]);
    return {
        analystData,
        loading,
        refetch: () => fetchAnalystMeta(visibleSymbols)
    };
}
