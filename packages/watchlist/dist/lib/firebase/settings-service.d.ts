import { WatchlistSettings } from '@watchlist/types';
export declare class SettingsService {
    private _userId;
    constructor(_userId: string);
    getWatchlistSettings(): Promise<WatchlistSettings>;
    updateWatchlistSettings(settings: Partial<WatchlistSettings>): Promise<void>;
    toggleExtendedHours(enabled: boolean): Promise<void>;
}
