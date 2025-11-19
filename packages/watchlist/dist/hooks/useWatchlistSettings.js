var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
import { SettingsService } from '@watchlist/lib/firebase/settings-service';
const createDefaultSettings = () => ({
    showExtendedHours: false,
    columnWidths: {},
    fontScale: 1
});
const normalizeSettings = (settings) => {
    var _a, _b, _c;
    return ({
        showExtendedHours: (_a = settings === null || settings === void 0 ? void 0 : settings.showExtendedHours) !== null && _a !== void 0 ? _a : false,
        columnWidths: (_b = settings === null || settings === void 0 ? void 0 : settings.columnWidths) !== null && _b !== void 0 ? _b : {},
        fontScale: (_c = settings === null || settings === void 0 ? void 0 : settings.fontScale) !== null && _c !== void 0 ? _c : 1
    });
};
/**
 * Hook to manage watchlist settings (persisted to Firebase)
 */
export function useWatchlistSettings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState(() => createDefaultSettings());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const previousSettingsRef = useRef(createDefaultSettings());
    // Load settings from Firebase on mount
    useEffect(() => {
        if (!user) {
            setSettings(createDefaultSettings());
            setIsLoading(false);
            setError(null);
            return;
        }
        const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
            try {
                setIsLoading(true);
                const service = new SettingsService(user.uid);
                const loadedSettings = yield service.getWatchlistSettings();
                setSettings(normalizeSettings(loadedSettings));
                setError(null);
            }
            catch (err) {
                console.error('Error loading watchlist settings:', err);
                setError(err instanceof Error ? err.message : 'Failed to load settings');
                // Keep default settings on error
            }
            finally {
                setIsLoading(false);
            }
        });
        loadSettings();
    }, [user]);
    const updateSettings = useCallback((updates) => __awaiter(this, void 0, void 0, function* () {
        const normalizedUpdates = Object.assign({}, updates);
        if (updates.columnWidths) {
            normalizedUpdates.columnWidths = Object.assign({}, updates.columnWidths);
        }
        setSettings(prev => {
            previousSettingsRef.current = prev;
            return Object.assign(Object.assign({}, prev), normalizedUpdates);
        });
        // If user is not authenticated, just keep the local optimistic value
        if (!user) {
            return;
        }
        try {
            const service = new SettingsService(user.uid);
            yield service.updateWatchlistSettings(normalizedUpdates);
            setError(null);
        }
        catch (err) {
            console.error('Error updating watchlist settings:', err);
            setError(err instanceof Error ? err.message : 'Failed to update settings');
            setSettings(previousSettingsRef.current);
            throw err;
        }
    }), [user]);
    // Toggle extended hours column visibility
    const toggleExtendedHours = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const newValue = !((_a = settings.showExtendedHours) !== null && _a !== void 0 ? _a : false);
        try {
            yield updateSettings({ showExtendedHours: newValue });
        }
        catch (_b) {
            // Errors handled in updateSettings
        }
    }), [settings.showExtendedHours, updateSettings]);
    return {
        settings,
        isLoading,
        error,
        toggleExtendedHours,
        updateSettings
    };
}
