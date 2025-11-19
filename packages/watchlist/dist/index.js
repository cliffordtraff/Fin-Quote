'use client';
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import './globals.css';
import WatchlistPage from './app/watchlist/page';
import { AuthProvider } from '@watchlist/lib/firebase/auth-context';
import { AiSummaryCacheProvider } from '@watchlist/contexts/AiSummaryContext';
import { ThemeProvider } from '@watchlist/components/ThemeProvider';
export function SundayWatchlistApp(_a = {}) {
    var { header } = _a, props = __rest(_a, ["header"]);
    return (_jsx(AuthProvider, { children: _jsx(ThemeProvider, { children: _jsx(AiSummaryCacheProvider, { children: _jsxs(_Fragment, { children: [header, _jsx(WatchlistPage, Object.assign({}, props))] }) }) }) }));
}
