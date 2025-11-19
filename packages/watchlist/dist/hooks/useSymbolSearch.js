var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useCallback, useRef, useEffect } from 'react';
export function useSymbolSearch() {
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [hasExtension, setHasExtension] = useState(false); // Always false - skip extension detection
    const searchTimeoutRef = useRef(null);
    const currentRequestRef = useRef(null);
    const abortControllerRef = useRef(null);
    // Skip extension detection - always use server
    // The extension detection was causing false positives and timeouts
    /*
    useEffect(() => {
      // Extension detection disabled - always use server API
    }, []);
    */
    const searchSymbols = useCallback((query) => {
        // Clear any existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        // Clear results if query is empty
        if (!query || query.trim().length === 0) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }
        // Variable debounce: 500ms for single character, 250ms for 2+
        const debounceMs = query.trim().length === 1 ? 500 : 250;
        searchTimeoutRef.current = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            const trimmedQuery = query.trim();
            // Minimum 1 character
            if (trimmedQuery.length < 1) {
                return;
            }
            // Generate request ID
            const requestId = `search-${Date.now()}-${Math.random()}`;
            currentRequestRef.current = requestId;
            setIsSearching(true);
            setSearchError(null);
            try {
                if (hasExtension) {
                    // Use extension for TradingView search
                    yield searchViaExtension(trimmedQuery, requestId);
                }
                else {
                    // Fallback to server API
                    yield searchViaServer(trimmedQuery, requestId);
                }
            }
            catch (error) {
                console.error('[useSymbolSearch] Search error:', error);
                setSearchError('Search failed');
                setIsSearching(false);
            }
        }), debounceMs);
    }, [hasExtension]);
    const searchViaExtension = (query, requestId) => __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // Extension not responding, disable it and fallback to server
                setHasExtension(false);
                searchViaServer(query, requestId).then(resolve).catch(reject);
            }, 2000); // Reduced timeout to 2 seconds
            const handleResponse = (event) => {
                if (event.data.type === 'TV_SYMBOL_SEARCH_RESPONSE' && event.data.requestId === requestId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handleResponse);
                    // Only update if this is still the current request
                    if (currentRequestRef.current === requestId) {
                        if (event.data.error) {
                            setSearchError(event.data.error);
                            setSearchResults([]);
                        }
                        else {
                            setSearchResults(event.data.results || []);
                            setSearchError(null);
                        }
                        setIsSearching(false);
                    }
                    resolve();
                }
            };
            window.addEventListener('message', handleResponse);
            // Send search request to extension
            window.postMessage({
                type: 'TV_SYMBOL_SEARCH',
                query: query,
                requestId: requestId
            }, '*');
        });
    });
    const searchViaServer = (query, requestId) => __awaiter(this, void 0, void 0, function* () {
        // Create abort controller for this request
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {
            // Try TradingView proxy first
            let response = yield fetch(`/api/tv/search?q=${encodeURIComponent(query)}`, {
                signal: controller.signal
            });
            // If TV proxy fails, fall back to FMP search
            if (!response.ok) {
                response = yield fetch(`/api/symbols/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal
                });
            }
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }
            const data = yield response.json();
            // Only update if this is still the current request
            if (currentRequestRef.current === requestId) {
                if (data.error) {
                    setSearchError(data.error);
                    setSearchResults([]);
                }
                else {
                    setSearchResults(data.results || []);
                    setSearchError(null);
                }
                setIsSearching(false);
            }
        }
        catch (error) {
            // Only update if this is still the current request and not aborted
            if (currentRequestRef.current === requestId && error.name !== 'AbortError') {
                setSearchError('Search failed');
                setSearchResults([]);
                setIsSearching(false);
            }
        }
    });
    const clearResults = useCallback(() => {
        setSearchResults([]);
        setSearchError(null);
        // Cancel any pending search
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);
    return {
        searchResults,
        isSearching,
        searchError,
        searchSymbols,
        clearResults,
        hasExtension
    };
}
