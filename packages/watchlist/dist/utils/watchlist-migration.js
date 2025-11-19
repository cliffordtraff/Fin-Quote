// Primary exchange mappings for common US stocks
const EXCHANGE_MAPPINGS = {
    // Tech stocks (typically NASDAQ)
    'AAPL': 'NASDAQ',
    'MSFT': 'NASDAQ',
    'GOOGL': 'NASDAQ',
    'GOOG': 'NASDAQ',
    'META': 'NASDAQ',
    'AMZN': 'NASDAQ',
    'NVDA': 'NASDAQ',
    'TSLA': 'NASDAQ',
    'AMD': 'NASDAQ',
    'INTC': 'NASDAQ',
    'CSCO': 'NASDAQ',
    'ADBE': 'NASDAQ',
    'NFLX': 'NASDAQ',
    'PYPL': 'NASDAQ',
    'CMCSA': 'NASDAQ',
    'PEP': 'NASDAQ',
    'COST': 'NASDAQ',
    'TMUS': 'NASDAQ',
    'AVGO': 'NASDAQ',
    'TXN': 'NASDAQ',
    'QCOM': 'NASDAQ',
    'SBUX': 'NASDAQ',
    'INTU': 'NASDAQ',
    'ISRG': 'NASDAQ',
    'BKNG': 'NASDAQ',
    'MDLZ': 'NASDAQ',
    'ADP': 'NASDAQ',
    'GILD': 'NASDAQ',
    'ADI': 'NASDAQ',
    'LRCX': 'NASDAQ',
    'ASML': 'NASDAQ',
    // NYSE stocks
    'JPM': 'NYSE',
    'V': 'NYSE',
    'JNJ': 'NYSE',
    'WMT': 'NYSE',
    'PG': 'NYSE',
    'MA': 'NYSE',
    'UNH': 'NYSE',
    'HD': 'NYSE',
    'DIS': 'NYSE',
    'BAC': 'NYSE',
    'CVX': 'NYSE',
    'ABBV': 'NYSE',
    'KO': 'NYSE',
    'PFE': 'NYSE',
    'MRK': 'NYSE',
    'TMO': 'NYSE',
    'ABT': 'NYSE',
    'VZ': 'NYSE',
    'WFC': 'NYSE',
    'T': 'NYSE',
    'COP': 'NYSE',
    'UPS': 'NYSE',
    'MS': 'NYSE',
    'LOW': 'NYSE',
    'GS': 'NYSE',
    'BLK': 'NYSE',
    'AXP': 'NYSE',
    'C': 'NYSE',
    'BA': 'NYSE',
    'MMM': 'NYSE',
    'CAT': 'NYSE',
    'GE': 'NYSE',
    'F': 'NYSE',
    'GM': 'NYSE',
    // Major ETFs
    'SPY': 'ARCA',
    'QQQ': 'NASDAQ',
    'IWM': 'ARCA',
    'VOO': 'ARCA',
    'VTI': 'ARCA',
    'EFA': 'ARCA',
    'GLD': 'ARCA',
    'AGG': 'NASDAQ',
    'IVV': 'ARCA',
    'EEM': 'ARCA',
    'VEA': 'ARCA',
    'BND': 'NASDAQ',
    'VUG': 'ARCA',
    'VTV': 'ARCA',
    'IEMG': 'ARCA',
    'LQD': 'ARCA',
    'VXUS': 'NASDAQ',
    'VIG': 'ARCA',
    'VYM': 'ARCA',
    'XLF': 'ARCA',
    'XLK': 'ARCA',
    'XLE': 'ARCA',
    'XLV': 'ARCA',
    'XLI': 'ARCA',
    'XLY': 'ARCA',
    'XLP': 'ARCA',
    'XLB': 'ARCA',
    'XLU': 'ARCA',
    'XLRE': 'ARCA',
    'DIA': 'ARCA',
    'ARKK': 'ARCA',
    'ARKQ': 'ARCA',
    'ARKW': 'ARCA',
    'ARKG': 'ARCA',
    'ARKF': 'ARCA',
    'SOXX': 'NASDAQ',
    'SMH': 'NASDAQ',
    'KWEB': 'ARCA',
    'ICLN': 'NASDAQ',
    'TAN': 'ARCA',
    'FAN': 'ARCA'
};
// Get the most likely exchange for a symbol
function getDefaultExchange(symbol) {
    const upperSymbol = symbol.toUpperCase();
    // Check if we have a specific mapping
    if (EXCHANGE_MAPPINGS[upperSymbol]) {
        return EXCHANGE_MAPPINGS[upperSymbol];
    }
    // For unknown US stocks, make an educated guess
    // Most tech stocks are on NASDAQ, others on NYSE
    // This is a rough heuristic
    return 'NASDAQ';
}
// Check if an entry needs migration (missing tvSymbol)
function needsMigration(item) {
    return item.type === 'stock' && item.symbol && !item.tvSymbol;
}
// Migrate a single watchlist tab
export function migrateWatchlistTabWithTvSymbols(tab) {
    if (!tab.items) {
        return tab;
    }
    let hasChanges = false;
    const migratedItems = tab.items.map(item => {
        if (needsMigration(item)) {
            hasChanges = true;
            const stock = item;
            const exchange = stock.exchange || getDefaultExchange(stock.symbol);
            return Object.assign(Object.assign({}, stock), { tvSymbol: `${exchange}:${stock.symbol.toUpperCase()}`, exchange: exchange });
        }
        return item;
    });
    return hasChanges ? Object.assign(Object.assign({}, tab), { items: migratedItems }) : tab;
}
// Migrate all tabs in a watchlist
export function migrateWatchlistWithTvSymbols(tabs) {
    let anyMigrated = false;
    const migratedTabs = tabs.map(tab => {
        const migratedTab = migrateWatchlistTabWithTvSymbols(tab);
        if (migratedTab !== tab) {
            anyMigrated = true;
        }
        return migratedTab;
    });
    return {
        tabs: migratedTabs,
        migrated: anyMigrated
    };
}
// Check if a watchlist needs migration
export function watchlistNeedsMigration(tabs) {
    return tabs.some(tab => { var _a; return ((_a = tab.items) === null || _a === void 0 ? void 0 : _a.some(item => needsMigration(item))) || false; });
}
