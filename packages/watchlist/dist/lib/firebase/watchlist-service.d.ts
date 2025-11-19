import type { WatchlistTab } from '@watchlist/types';
export declare class WatchlistService {
    private _userId;
    constructor(_userId: string);
    getWatchlist(): Promise<{
        tabs: WatchlistTab[];
        activeTabIndex: number;
    } | null>;
    saveWatchlist(tabs: WatchlistTab[], activeTabIndex: number): Promise<void>;
    updateTabs(tabs: WatchlistTab[]): Promise<void>;
    updateActiveTabIndex(activeTabIndex: number): Promise<void>;
    migrateFromLocalStorage(): Promise<boolean>;
}
