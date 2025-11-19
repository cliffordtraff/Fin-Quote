import { WatchlistSettings } from '@watchlist/types';
/**
 * Hook to manage watchlist settings (persisted to Firebase)
 */
export declare function useWatchlistSettings(): {
    settings: WatchlistSettings;
    isLoading: boolean;
    error: string | null;
    toggleExtendedHours: () => Promise<void>;
    updateSettings: (updates: Partial<WatchlistSettings>) => Promise<void>;
};
