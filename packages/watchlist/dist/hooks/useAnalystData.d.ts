interface AnalystMeta {
    hasAnalystData: boolean;
    recentChanges: number;
    latestAction?: string;
    latestDate?: string;
    latestCompany?: string;
    latestGrade?: string;
    priceTarget?: number;
    upgrades: number;
    downgrades: number;
    initiations: number;
}
interface AnalystData {
    [symbol: string]: AnalystMeta;
}
interface UseAnalystDataOptions {
    visibleSymbols: string[];
    enabled?: boolean;
}
export declare function useAnalystData({ visibleSymbols, enabled }: UseAnalystDataOptions): {
    analystData: AnalystData;
    loading: boolean;
    refetch: () => any;
};
export {};
