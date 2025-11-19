'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { cache } from '@watchlist/utils/localStorage-cache';
export function CacheIndicator() {
    const [stats, setStats] = useState(null);
    const [showStats, setShowStats] = useState(false);
    useEffect(() => {
        // Update stats every 5 seconds
        const updateStats = () => {
            const cacheStats = cache.getStats();
            setStats({
                count: cacheStats.count,
                sizeKB: cacheStats.sizeKB
            });
        };
        updateStats();
        const interval = setInterval(updateStats, 5000);
        return () => clearInterval(interval);
    }, []);
    const handleClearCache = () => {
        if (confirm('Clear all cached data? This will not affect your saved watchlists.')) {
            cache.clearAll();
            window.location.reload();
        }
    };
    if (!stats)
        return null;
    return (_jsxs("div", { style: {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: 1000
        }, children: [_jsxs("button", { onClick: () => setShowStats(!showStats), style: {
                    background: stats.count > 0 ? '#4caf50' : '#888',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }, title: "Cache status - click for details", children: [_jsx("span", { style: {
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: stats.count > 0 ? '#00ff00' : '#fff',
                            display: 'inline-block'
                        } }), "Cache ", stats.count > 0 ? 'Active' : 'Empty'] }), showStats && (_jsxs("div", { style: {
                    position: 'absolute',
                    bottom: '40px',
                    right: '0',
                    background: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    minWidth: '200px'
                }, children: [_jsx("h4", { style: { margin: '0 0 8px 0', fontSize: '14px' }, children: "Cache Statistics" }), _jsxs("div", { style: { fontSize: '12px', color: '#666' }, children: [_jsxs("div", { children: ["Items cached: ", _jsx("strong", { children: stats.count })] }), _jsxs("div", { children: ["Size: ", _jsxs("strong", { children: [stats.sizeKB, " KB"] })] }), _jsx("div", { style: { marginTop: '8px' }, children: _jsx("button", { onClick: handleClearCache, style: {
                                        background: '#d32f2f',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        width: '100%'
                                    }, children: "Clear Cache" }) })] })] }))] }));
}
