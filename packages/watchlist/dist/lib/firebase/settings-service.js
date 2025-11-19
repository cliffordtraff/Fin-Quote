var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function apiRequest(url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(url, Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Content-Type': 'application/json' }, ((options === null || options === void 0 ? void 0 : options.headers) || {})), cache: 'no-store' }));
        if (!response.ok) {
            const text = yield response.text().catch(() => '');
            throw new Error(text || response.statusText);
        }
        return (yield response.json());
    });
}
export class SettingsService {
    constructor(_userId) {
        this._userId = _userId;
    }
    getWatchlistSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const data = yield apiRequest('/api/watchlist/settings');
                return {
                    showExtendedHours: (_a = data.showExtendedHours) !== null && _a !== void 0 ? _a : false,
                    columnWidths: (_b = data.columnWidths) !== null && _b !== void 0 ? _b : {},
                    fontScale: (_c = data.fontScale) !== null && _c !== void 0 ? _c : 1
                };
            }
            catch (error) {
                console.warn('[watchlist] Failed to load settings, using defaults', error);
                return { showExtendedHours: false };
            }
        });
    }
    updateWatchlistSettings(settings) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield apiRequest('/api/watchlist/settings', {
                    method: 'PUT',
                    body: JSON.stringify(settings)
                });
            }
            catch (error) {
                console.warn('[watchlist] Failed to update settings', error);
                throw error;
            }
        });
    }
    toggleExtendedHours(enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.updateWatchlistSettings({ showExtendedHours: enabled });
        });
    }
}
