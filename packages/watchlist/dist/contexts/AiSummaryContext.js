'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from 'react';
const AiSummaryCacheContext = createContext(undefined);
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes during market hours
const MAX_CACHE_ENTRIES = 100; // Limit cache size
export function AiSummaryCacheProvider({ children }) {
    const [cache, setCacheState] = useState(new Map());
    const getCacheKey = (symbol, headlinesHash) => {
        return `${symbol}:${headlinesHash}`;
    };
    const getCache = useCallback((symbol, headlinesHash) => {
        const key = getCacheKey(symbol, headlinesHash);
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }
        // Check if entry is stale
        const age = Date.now() - entry.timestamp;
        if (age > CACHE_TTL_MS) {
            console.log(`[AiSummaryCache] Cache entry stale for ${symbol} (${(age / 1000).toFixed(0)}s old)`);
            return null;
        }
        console.log(`[AiSummaryCache] Cache hit for ${symbol} (${(age / 1000).toFixed(0)}s old)`);
        return entry;
    }, [cache]);
    const setCache = useCallback((symbol, headlinesHash, entry) => {
        const key = getCacheKey(symbol, headlinesHash);
        setCacheState(prevCache => {
            const newCache = new Map(prevCache);
            // Evict oldest entries if cache is full
            if (newCache.size >= MAX_CACHE_ENTRIES && !newCache.has(key)) {
                const entries = Array.from(newCache.entries());
                entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                const toRemove = entries.slice(0, Math.floor(MAX_CACHE_ENTRIES * 0.2)); // Remove oldest 20%
                toRemove.forEach(([k]) => newCache.delete(k));
                console.log(`[AiSummaryCache] Evicted ${toRemove.length} old entries`);
            }
            newCache.set(key, Object.assign(Object.assign({}, entry), { headlinesHash, timestamp: Date.now() }));
            console.log(`[AiSummaryCache] Cached summary for ${symbol} (total: ${newCache.size} entries)`);
            return newCache;
        });
    }, []);
    const clearCache = useCallback((symbol) => {
        if (symbol) {
            setCacheState(prevCache => {
                const newCache = new Map(prevCache);
                // Remove all entries for this symbol (regardless of headlines hash)
                Array.from(newCache.keys())
                    .filter(key => key.startsWith(`${symbol}:`))
                    .forEach(key => newCache.delete(key));
                console.log(`[AiSummaryCache] Cleared cache for ${symbol}`);
                return newCache;
            });
        }
        else {
            setCacheState(new Map());
            console.log('[AiSummaryCache] Cleared entire cache');
        }
    }, []);
    const getCacheStats = useCallback(() => {
        const entries = Array.from(cache.values());
        return {
            size: cache.size,
            oldestEntry: entries.length > 0
                ? Math.min(...entries.map(e => e.timestamp))
                : null
        };
    }, [cache]);
    return (_jsx(AiSummaryCacheContext.Provider, { value: { getCache, setCache, clearCache, getCacheStats }, children: children }));
}
export function useAiSummaryCache() {
    const context = useContext(AiSummaryCacheContext);
    if (!context) {
        throw new Error('useAiSummaryCache must be used within AiSummaryCacheProvider');
    }
    return context;
}
