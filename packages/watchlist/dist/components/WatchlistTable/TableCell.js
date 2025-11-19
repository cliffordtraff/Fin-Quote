'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import NewsIndicator from '@watchlist/components/NewsIndicator';
const SYMBOL_HEADER_LABEL = 'Symbol';
const DIVIDEND_YIELD_HEADER_LABEL = 'Div Yield';
// Helper: Format numbers
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined)
        return 'N/A';
    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}
// Helper: Format large numbers
function formatLargeNumber(num) {
    if (num === null || num === undefined)
        return 'N/A';
    if (num >= 1e9) {
        const billions = num / 1e9;
        if (billions >= 1000) {
            return billions.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }) + 'B';
        }
        return billions.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + 'B';
    }
    if (num >= 1e6)
        return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3)
        return (num / 1e3).toFixed(2) + 'K';
    return num.toLocaleString();
}
// Helper: Format date
function formatExDate(dateStr) {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'None')
        return '– –';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime()))
            return dateStr;
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(2);
        return `${month}/${day}/${year}`;
    }
    catch (e) {
        return dateStr;
    }
}
const TableCell = memo(function TableCell({ style, columnKey, rowData, isHeader = false, isHighlighted = false, isSelected = false, deleteMode = false, reorderMode = false, newsMeta, rssNewsMeta, analystMeta, allArticles = [], onCellClick, onCheckboxChange, onNewsClick }) {
    // Base cell styles
    const cellStyle = Object.assign(Object.assign({}, style), { padding: '8px', borderBottom: '1px solid #e0e0e0', borderRight: '1px solid #f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', backgroundColor: isHighlighted ? '#fffacd' : isSelected ? '#e3f2fd' : 'white', cursor: onCellClick ? 'pointer' : 'default', fontSize: '14px' });
    // Header cell
    if (isHeader) {
        return (_jsx("div", { style: Object.assign(Object.assign({}, cellStyle), { fontWeight: 'bold', backgroundColor: '#f8f9fa' }), children: getColumnLabel(columnKey) }));
    }
    // Data cell
    if (!rowData) {
        return _jsx("div", { style: cellStyle, children: "..." });
    }
    const isPositive = rowData.change >= 0;
    const changeColor = isPositive ? '#008f3b' : '#d60000';
    // Render content based on column
    let content = null;
    let cellAlign = 'right';
    switch (columnKey) {
        case 'control':
            // Control column for delete/reorder mode
            if (deleteMode) {
                content = (_jsx("input", { type: "checkbox", checked: isSelected, onChange: (e) => {
                        e.stopPropagation();
                        onCheckboxChange === null || onCheckboxChange === void 0 ? void 0 : onCheckboxChange(e.target.checked);
                    }, style: {
                        cursor: 'pointer',
                        width: '18px',
                        height: '18px',
                        margin: 0
                    }, onClick: (e) => e.stopPropagation() }));
                cellAlign = 'center';
            }
            else if (reorderMode) {
                content = (_jsx("span", { style: { fontSize: '18px', cursor: 'grab' }, children: "\u2630" }));
                cellAlign = 'center';
            }
            break;
        case 'symbol':
            content = rowData.symbol;
            cellAlign = 'left';
            break;
        case 'news':
            const totalNewsCount = ((newsMeta === null || newsMeta === void 0 ? void 0 : newsMeta.count) || 0) + ((rssNewsMeta === null || rssNewsMeta === void 0 ? void 0 : rssNewsMeta.count) || 0);
            const totalAnalystCount = (analystMeta === null || analystMeta === void 0 ? void 0 : analystMeta.count) || 0;
            content = (_jsx(NewsIndicator, { news: null, newsCount: totalNewsCount, fmpNewsCount: totalNewsCount, onNewsClick: onNewsClick || (() => { }), symbol: rowData.symbol, allArticles: allArticles }));
            cellAlign = 'center';
            break;
        case 'lastTrade':
            content = formatNumber(rowData.price);
            break;
        case 'change':
            content = (_jsxs("span", { style: { color: changeColor }, children: [isPositive && '+', formatNumber(rowData.change)] }));
            break;
        case 'changePercent':
            content = (_jsxs("span", { style: { color: changeColor }, children: [formatNumber(Math.abs(rowData.changePercent)), "%"] }));
            break;
        case 'bid':
            content = formatNumber(rowData.bid);
            break;
        case 'ask':
            content = formatNumber(rowData.ask);
            break;
        case 'volume':
            content = formatLargeNumber(rowData.volume);
            break;
        case 'low':
            content = formatNumber(rowData.dayLow);
            break;
        case 'high':
            content = formatNumber(rowData.dayHigh);
            break;
        case 'marketCap':
            content = formatLargeNumber(rowData.marketCap);
            break;
        case 'peRatio':
            content = rowData.peRatio ? formatNumber(rowData.peRatio) : 'N/A';
            break;
        case 'exDate':
            content = rowData.exDividendDate === undefined ? (_jsx("span", { style: { fontWeight: 300, color: '#666' }, children: "..." })) : rowData.exDividendDate ? (formatExDate(rowData.exDividendDate)) : (_jsx("span", { style: { fontWeight: 300 }, children: "\u2013 \u2013" }));
            break;
        case 'eps':
            content = rowData.eps ? formatNumber(rowData.eps) : 'N/A';
            break;
        case 'divYield':
            content = rowData.dividendYield === undefined ? (_jsx("span", { style: { fontWeight: 300, color: '#666' }, children: "..." })) : rowData.dividendYield === null || rowData.dividendYield === 0 ? (_jsx("span", { style: { fontWeight: 300 }, children: "\u2013 \u2013" })) : (_jsxs("span", { style: { color: '#000000', fontWeight: 600 }, children: [formatNumber(rowData.dividendYield, 2), "%"] }));
            break;
        case 'name':
            content = rowData.name;
            cellAlign = 'left';
            break;
        default:
            content = 'N/A';
    }
    return (_jsx("div", { style: Object.assign(Object.assign({}, cellStyle), { justifyContent: cellAlign === 'left' ? 'flex-start' : cellAlign === 'right' ? 'flex-end' : 'center' }), onClick: onCellClick, children: content }));
});
// Helper function for column labels
function getColumnLabel(columnKey) {
    const labels = {
        symbol: SYMBOL_HEADER_LABEL,
        news: 'News',
        lastTrade: 'Last Trade',
        change: 'Change',
        changePercent: '%',
        bid: 'Bid',
        ask: 'Ask',
        volume: 'Volume',
        low: 'Low',
        high: 'High',
        marketCap: 'M. Cap',
        peRatio: 'P/E (ttm)',
        exDate: 'Ex-Date',
        eps: 'EPS (ttm)',
        divYield: DIVIDEND_YIELD_HEADER_LABEL,
        name: 'Description'
    };
    return labels[columnKey] || columnKey;
}
export default TableCell;
