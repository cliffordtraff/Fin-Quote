// Transform FMP WebSocket message to our Stock interface
export function transformWebSocketData(wsData) {
    var _a, _b;
    return {
        symbol: ((_a = wsData.symbol) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || ((_b = wsData.s) === null || _b === void 0 ? void 0 : _b.toUpperCase()),
        price: wsData.price || wsData.p,
        bid: wsData.bid || wsData.b,
        ask: wsData.ask || wsData.a,
        bidSize: wsData.bidSize || wsData.bs,
        askSize: wsData.askSize || wsData.as,
        volume: wsData.volume || wsData.v,
        lastUpdated: new Date(wsData.timestamp || wsData.t || Date.now())
    };
}
// Transform FMP REST quote data to our Stock interface
export function transformQuoteData(fmpQuote) {
    var _a, _b, _c, _d;
    const changePercent = fmpQuote.changesPercentage || 0;
    const change = fmpQuote.change || 0;
    return {
        symbol: fmpQuote.symbol,
        name: fmpQuote.name || '',
        price: fmpQuote.price || 0,
        change: change,
        changePercent: changePercent,
        volume: fmpQuote.volume || 0,
        // Use actual bid/ask from FMP if available, otherwise fallback to price ± spread
        bid: (_a = fmpQuote.bid) !== null && _a !== void 0 ? _a : (fmpQuote.price - 0.01),
        ask: (_b = fmpQuote.ask) !== null && _b !== void 0 ? _b : (fmpQuote.price + 0.01),
        bidSize: (_c = fmpQuote.bidSize) !== null && _c !== void 0 ? _c : 0,
        askSize: (_d = fmpQuote.askSize) !== null && _d !== void 0 ? _d : 0,
        dayLow: fmpQuote.dayLow || 0,
        dayHigh: fmpQuote.dayHigh || 0,
        weekLow52: fmpQuote.yearLow || 0,
        weekHigh52: fmpQuote.yearHigh || 0,
        marketCap: fmpQuote.marketCap || 0,
        peRatio: fmpQuote.pe || null,
        eps: fmpQuote.eps || null,
        dividendYield: null, // Will be populated from company profile
        exDividendDate: null, // Will be populated from dividend calendar
        lastUpdated: new Date()
    };
}
// Transform FMP company profile to enrich Stock data
export function enrichWithCompanyProfile(stock, profile) {
    return Object.assign(Object.assign({}, stock), { name: profile.companyName || stock.name, marketCap: profile.mktCap || stock.marketCap, peRatio: profile.pe || stock.peRatio, eps: profile.eps || stock.eps, dividendYield: profile.lastDiv ? (profile.lastDiv / profile.price) * 100 : null });
}
// Transform FMP dividend data to get ex-dividend date
export function enrichWithDividendData(stock, dividends) {
    var _a;
    if (!dividends || dividends.length === 0) {
        return stock;
    }
    // Find the next ex-dividend date
    const today = new Date();
    const futureDividends = dividends.filter(d => new Date(d.date) >= today).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (futureDividends.length > 0) {
        return Object.assign(Object.assign({}, stock), { exDividendDate: futureDividends[0].date });
    }
    // If no future dividends, get the most recent one
    const pastDividends = dividends.filter(d => new Date(d.date) < today).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return Object.assign(Object.assign({}, stock), { exDividendDate: ((_a = pastDividends[0]) === null || _a === void 0 ? void 0 : _a.date) || null });
}
// Merge WebSocket real-time data with cached fundamental data
export function mergeRealtimeWithFundamentals(realtimeData, fundamentalData) {
    return Object.assign(Object.assign(Object.assign({}, fundamentalData), realtimeData), { 
        // Calculate change and changePercent from real-time price
        change: realtimeData.price && fundamentalData.price
            ? realtimeData.price - fundamentalData.price
            : fundamentalData.change, changePercent: realtimeData.price && fundamentalData.price && fundamentalData.price !== 0
            ? ((realtimeData.price - fundamentalData.price) / fundamentalData.price) * 100
            : fundamentalData.changePercent, lastUpdated: new Date() });
}
