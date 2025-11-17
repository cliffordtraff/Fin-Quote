import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
import type { SymbolMappingResponse } from '@watchlist/types/symbol-mapping';

// Client-side cache for mappings
const CACHE_KEY_PREFIX = 'symbol_mapping_';
const CACHE_TTL_VERIFIED = 24 * 60 * 60 * 1000; // 24 hours for verified
const CACHE_TTL_UNVERIFIED = 60 * 60 * 1000; // 1 hour for unverified
const MAX_CACHE_SIZE = 100;

interface CachedMapping {
  data: SymbolMappingResponse;
  timestamp: number;
  ttl: number;
}

// In-memory cache for current session
const memoryCache = new Map<string, SymbolMappingResponse>();

/**
 * Hook to get and manage symbol mappings
 */
export function useSymbolMapping(fmpSymbol: string | null) {
  const { user } = useAuth();
  const [mapping, setMapping] = useState<SymbolMappingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get mapping from cache or API
  const getMapping = useCallback(async (symbol: string) => {
    // Check memory cache first
    if (memoryCache.has(symbol)) {
      return memoryCache.get(symbol)!;
    }
    
    // Check localStorage cache
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const { data, timestamp, ttl }: CachedMapping = JSON.parse(cached);
        
        if (Date.now() - timestamp < ttl) {
          // Cache is still valid
          memoryCache.set(symbol, data);
          return data;
        } else {
          // Cache expired, remove it
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (err) {
      console.error('Error reading cache:', err);
    }
    
    // Fetch from API
    const response = await fetch(`/api/symbols/mapping?symbol=${encodeURIComponent(symbol)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Mapping not found, return null
        return null;
      }
      throw new Error(`Failed to fetch mapping: ${response.statusText}`);
    }
    
    const data: SymbolMappingResponse = await response.json();
    
    // Cache the result
    cacheMapping(symbol, data);
    
    return data;
  }, []);
  
  // Cache a mapping
  const cacheMapping = useCallback((symbol: string, data: SymbolMappingResponse) => {
    // Add to memory cache
    memoryCache.set(symbol, data);
    
    // Add to localStorage with appropriate TTL
    const ttl = data.confidence === 'verified' ? CACHE_TTL_VERIFIED : CACHE_TTL_UNVERIFIED;
    const cacheEntry: CachedMapping = {
      data,
      timestamp: Date.now(),
      ttl
    };
    
    try {
      const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      
      // Clean up old cache entries if needed
      cleanupCache();
    } catch (err) {
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
            if (!item) return null;
            const { timestamp } = JSON.parse(item);
            return { key, timestamp };
          } catch {
            return null;
          }
        }).filter(Boolean) as { key: string; timestamp: number }[];
        
        entries.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove oldest entries
        const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE + 10);
        toRemove.forEach(({ key }) => localStorage.removeItem(key));
      }
    } catch (err) {
      console.error('Error cleaning cache:', err);
    }
  }, []);
  
  // Create or update a mapping
  const createMapping = useCallback(async (
    fmpSymbol: string,
    tvSymbol: string,
    exchange: string,
    name: string,
    type: 'stock' | 'etf' | 'index' = 'stock'
  ) => {
    const response = await fetch('/api/symbols/mapping', {
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
  }, []);
  
  // Report incorrect mapping (user override)
  const reportIncorrectMapping = useCallback(async (
    fmpSymbol: string,
    correctTvSymbol: string
  ) => {
    if (!user) {
      throw new Error('Must be logged in to report incorrect mapping');
    }
    
    const response = await fetch('/api/symbols/mapping/correction', {
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
  }, [user]);
  
  // Effect to load mapping when symbol changes
  useEffect(() => {
    if (!fmpSymbol) {
      setMapping(null);
      setError(null);
      return;
    }
    
    let cancelled = false;
    
    const loadMapping = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await getMapping(fmpSymbol);
        
        if (!cancelled) {
          setMapping(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load mapping');
          setMapping(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
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
export function useSymbolMappings(fmpSymbols: string[]) {
  const [mappings, setMappings] = useState<Map<string, SymbolMappingResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (fmpSymbols.length === 0) {
      setMappings(new Map());
      return;
    }
    
    let cancelled = false;
    
    const loadMappings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check cache first
        const uncachedSymbols: string[] = [];
        const cachedMappings = new Map<string, SymbolMappingResponse>();
        
        for (const symbol of fmpSymbols) {
          // Check memory cache
          if (memoryCache.has(symbol)) {
            cachedMappings.set(symbol, memoryCache.get(symbol)!);
            continue;
          }
          
          // Check localStorage cache
          try {
            const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
            const cached = localStorage.getItem(cacheKey);
            
            if (cached) {
              const { data, timestamp, ttl }: CachedMapping = JSON.parse(cached);
              
              if (Date.now() - timestamp < ttl) {
                cachedMappings.set(symbol, data);
                memoryCache.set(symbol, data);
                continue;
              }
            }
          } catch {}
          
          uncachedSymbols.push(symbol);
        }
        
        // Fetch uncached symbols
        if (uncachedSymbols.length > 0) {
          const response = await fetch(
            `/api/symbols/mapping/batch?symbols=${uncachedSymbols.join(',')}`
          );
          
          if (response.ok) {
            const { mappings: fetchedMappings } = await response.json();
            
            // Cache and merge results
            for (const [symbol, mapping] of Object.entries(fetchedMappings)) {
              cachedMappings.set(symbol, mapping as SymbolMappingResponse);
              
              // Cache for future use
              const ttl = (mapping as SymbolMappingResponse).confidence === 'verified' 
                ? CACHE_TTL_VERIFIED 
                : CACHE_TTL_UNVERIFIED;
              
              const cacheEntry: CachedMapping = {
                data: mapping as SymbolMappingResponse,
                timestamp: Date.now(),
                ttl
              };
              
              try {
                const cacheKey = `${CACHE_KEY_PREFIX}${symbol}`;
                localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
                memoryCache.set(symbol, mapping as SymbolMappingResponse);
              } catch {}
            }
          }
        }
        
        if (!cancelled) {
          setMappings(cachedMappings);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load mappings');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadMappings();
    
    return () => {
      cancelled = true;
    };
  }, [fmpSymbols.join(',')]); // Use joined string as dependency
  
  return { mappings, loading, error };
}