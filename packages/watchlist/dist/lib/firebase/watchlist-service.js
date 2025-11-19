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
            const message = text || response.statusText;
            throw new Error(message || 'Request failed');
        }
        return (yield response.json());
    });
}
export class WatchlistService {
    // The constructor signature stays the same to match Sunday’s hook usage
    constructor(_userId) {
        this._userId = _userId;
    }
    getWatchlist() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield apiRequest('/api/watchlist');
            }
            catch (error) {
                console.warn('[watchlist] Failed to load watchlist, falling back to defaults', error);
                return null;
            }
        });
    }
    saveWatchlist(tabs, activeTabIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            yield apiRequest('/api/watchlist', {
                method: 'PUT',
                body: JSON.stringify({ tabs, activeTabIndex })
            });
        });
    }
    updateTabs(tabs) {
        return __awaiter(this, void 0, void 0, function* () {
            yield apiRequest('/api/watchlist', {
                method: 'PUT',
                body: JSON.stringify({ tabs })
            });
        });
    }
    updateActiveTabIndex(activeTabIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            yield apiRequest('/api/watchlist', {
                method: 'PUT',
                body: JSON.stringify({ activeTabIndex })
            });
        });
    }
    migrateFromLocalStorage() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const localTabs = localStorage.getItem('watchlistTabs');
                if (!localTabs) {
                    return false;
                }
                const tabs = JSON.parse(localTabs);
                const activeTabIndex = parseInt(localStorage.getItem('activeWatchlistTabIndex') || '0', 10) || 0;
                yield this.saveWatchlist(tabs, activeTabIndex);
                localStorage.removeItem('pendingDataImport');
                return true;
            }
            catch (error) {
                console.warn('[watchlist] Failed to migrate local data', error);
                return false;
            }
        });
    }
}
