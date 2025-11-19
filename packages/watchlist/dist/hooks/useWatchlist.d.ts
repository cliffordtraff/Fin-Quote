import { WatchlistTab } from '@watchlist/types';
export declare function useWatchlist(): {
    tabs: WatchlistTab[];
    activeTabIndex: number;
    isLoading: boolean;
    isSaving: boolean;
    setTabs: (newTabs: WatchlistTab[]) => Promise<void>;
    setActiveTabIndex: (index: number) => Promise<void>;
    addSymbol: (symbolOrData: string | {
        symbol: string;
        tvSymbol?: string;
        exchange?: string;
        companyName?: string;
        isADR?: boolean;
    }) => void;
    addHeader: (text: string) => void;
    addHeaderRow: (text: string, index: number) => void;
    addStockRow: (stockData: {
        symbol: string;
        tvSymbol?: string;
        exchange?: string;
        companyName?: string;
        isADR?: boolean;
    }, index: number) => void;
    renameHeader: (oldName: string, newName: string) => void;
    removeSymbol: (symbol: string) => void;
    removeSymbols: (symbols: string[]) => void;
    reorderSymbols: (newSymbols: string[]) => void;
    currentTab: WatchlistTab;
};
