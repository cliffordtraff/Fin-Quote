import type { SymbolMappingResponse } from '@watchlist/types/symbol-mapping';
/**
 * Hook to get and manage symbol mappings
 */
export declare function useSymbolMapping(fmpSymbol: string | null): {
    mapping: SymbolMappingResponse | null;
    loading: boolean;
    error: string | null;
    createMapping: (fmpSymbol: string, tvSymbol: string, exchange: string, name: string, type?: "stock" | "etf" | "index") => Promise<any>;
    reportIncorrectMapping: (fmpSymbol: string, correctTvSymbol: string) => Promise<any>;
    refetch: () => "" | Promise<SymbolMappingResponse | null> | null;
};
/**
 * Hook to get multiple symbol mappings at once
 */
export declare function useSymbolMappings(fmpSymbols: string[]): {
    mappings: Map<string, SymbolMappingResponse>;
    loading: boolean;
    error: string | null;
};
