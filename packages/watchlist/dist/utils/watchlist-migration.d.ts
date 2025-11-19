import { WatchlistTab } from '@watchlist/types';
export declare function migrateWatchlistTabWithTvSymbols(tab: WatchlistTab): WatchlistTab;
export declare function migrateWatchlistWithTvSymbols(tabs: WatchlistTab[]): {
    tabs: WatchlistTab[];
    migrated: boolean;
};
export declare function watchlistNeedsMigration(tabs: WatchlistTab[]): boolean;
