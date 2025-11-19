export interface SearchResult {
    symbol: string;
    tvSymbol: string;
    name: string;
    exchange: string;
    type: string;
    country?: string;
    currency?: string;
    isADR?: boolean;
    source: string;
}
interface UseSymbolSearchReturn {
    searchResults: SearchResult[];
    isSearching: boolean;
    searchError: string | null;
    searchSymbols: (query: string) => void;
    clearResults: () => void;
    hasExtension: boolean;
}
export declare function useSymbolSearch(): UseSymbolSearchReturn;
export {};
