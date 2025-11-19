import { ReactNode } from 'react';
export interface AiSummaryCacheEntry {
    summary: string;
    data: any;
    sources: any[];
    earningsContext: any;
    timestamp: number;
    headlinesHash: string;
}
interface AiSummaryCacheContextValue {
    getCache: (symbol: string, headlinesHash: string) => AiSummaryCacheEntry | null;
    setCache: (symbol: string, headlinesHash: string, entry: Omit<AiSummaryCacheEntry, 'timestamp' | 'headlinesHash'>) => void;
    clearCache: (symbol?: string) => void;
    getCacheStats: () => {
        size: number;
        oldestEntry: number | null;
    };
}
export declare function AiSummaryCacheProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useAiSummaryCache(): AiSummaryCacheContextValue;
export {};
