'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, memo, useRef, useEffect, startTransition, useMemo } from 'react';
import StockRow from './StockRow';
import VirtualizedTable from './VirtualizedTable';
import { useColumnResize } from '@watchlist/hooks/useColumnResize';
import { useMergedStockData } from '@watchlist/hooks/useMergedStockData';
import { useNewsData } from '@watchlist/hooks/useNewsData';
import { useAnalystData } from '@watchlist/hooks/useAnalystData';
import { useRSSNews } from '@watchlist/hooks/useRSSNews';
import { normalizeSymbol } from '@watchlist/utils/symbolNormalizer';
import { DataSourceIndicator } from '@watchlist/components/DataSourceIndicator';
import ApiErrorMessage from '@watchlist/components/ApiErrorMessage';
import { isStock, isHeader } from '@watchlist/utils/watchlist-helpers';
// Threshold for enabling virtual scrolling (symbols count)
const VIRTUALIZATION_THRESHOLD = 100;
const SYMBOL_HEADER_LABEL = 'Symbol';
const DIVIDEND_YIELD_HEADER_LABEL = 'Div Yield';
const WatchlistTable = memo(function WatchlistTable({ symbols, items, allSymbolsWithTabs, activeTabIndex, onRemoveSymbol, onRemoveSymbols, onRenameHeader, onAddHeaderRow, onAddTickerRow, onSymbolClick, deleteMode = false, reorderMode = false, onReorderMode, onSelectionChange, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, draggedIndex, dropIndex, dropPosition, placeholderRow, onPlaceholderHeaderSave, onPlaceholderCancel, showExtendedHours = false, columnWidthOverrides, onColumnWidthsChange, onShowNewsModal, onShowAnalystModal }) {
    const [highlightedSymbol, setHighlightedSymbol] = useState(null);
    const [selectedSymbols, setSelectedSymbols] = useState(new Set());
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        columnKey: null,
        type: 'column'
    });
    const tableRef = useRef(null);
    const containerRef = useRef(null);
    const { columnWidths, handleResizeStart, handleDoubleClick, isResizing } = useColumnResize(tableRef, {
        persistedWidths: columnWidthOverrides,
        onWidthsPersist: onColumnWidthsChange,
        disableLocalStorage: Boolean(onColumnWidthsChange)
    });
    // Track if this is the initial load
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    // Track visible symbols for viewport-based fetching
    const [visibleSymbols, setVisibleSymbols] = useState([]);
    // Extract all unique symbols for data fetching (upfront loading)
    const allSymbols = useMemo(() => {
        if (allSymbolsWithTabs && allSymbolsWithTabs.length > 0) {
            // Use upfront loading: return ALL symbols from all tabs
            return allSymbolsWithTabs.map(item => item.symbol);
        }
        // Fallback to current tab symbols for backward compatibility
        return symbols;
    }, [allSymbolsWithTabs, symbols]);
    // Use merged data hook for both price and dividend data
    const { stockData, isLoading, isDividendLoading, error, isConnected, marketStatus, dataSource, lastUpdated, refresh } = useMergedStockData({
        symbols: allSymbols, // Use all symbols for upfront loading
        visibleSymbols, // Pass visible symbols for viewport polling
        enabled: allSymbols.length > 0,
        showExtendedHours // Pass extended hours flag
    });
    // Fetch news data for visible symbols only
    const { newsData, fetchArticles, prefetchArticles } = useNewsData({
        visibleSymbols,
        enabled: visibleSymbols.length > 0
    });
    // Fetch RSS news data for visible symbols only
    const { rssNewsData, fetchArticlesForSymbol: fetchRSSArticles, prefetchArticles: prefetchRSSArticles } = useRSSNews({
        visibleSymbols,
        enabled: visibleSymbols.length > 0
    });
    // Debug RSS news data
    useEffect(() => {
        // RSS news data loaded
    }, [rssNewsData]);
    // Fetch analyst data for visible symbols only
    const { analystData } = useAnalystData({
        visibleSymbols,
        enabled: visibleSymbols.length > 0
    });
    // Mark as loaded once we have data
    useEffect(() => {
        if (stockData.size > 0 && !hasLoadedOnce) {
            setHasLoadedOnce(true);
        }
    }, [stockData.size, hasLoadedOnce]);
    // Detect visible symbols based on viewport
    useEffect(() => {
        var _a;
        const updateVisibleSymbols = () => {
            if (!containerRef.current || !tableRef.current)
                return;
            const container = containerRef.current;
            const rows = tableRef.current.querySelectorAll('tbody tr');
            const containerRect = container.getBoundingClientRect();
            const visible = [];
            const buffer = 500; // Increased buffer: ~500 pixels above/below viewport
            const maxSymbols = 50; // Cap at 50 symbols max
            rows.forEach((row, index) => {
                // Stop if we've collected enough symbols
                if (visible.length >= maxSymbols)
                    return;
                const rect = row.getBoundingClientRect();
                const isVisible = rect.bottom >= (containerRect.top - buffer) &&
                    rect.top <= (containerRect.bottom + buffer);
                // Also include first N symbols regardless of visibility
                const isInTopN = index < 20; // Always include first 20 symbols
                if (isVisible || isInTopN) {
                    // Get symbol from the row data
                    if (items && items[index] && isStock(items[index])) {
                        visible.push(items[index].symbol);
                    }
                    else if (!items && symbols[index]) {
                        visible.push(symbols[index]);
                    }
                }
            });
            setVisibleSymbols(visible);
        };
        // Initial check
        updateVisibleSymbols();
        // Update on scroll with debounce
        let scrollTimeout;
        const handleScroll = () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(updateVisibleSymbols, 150);
        };
        // Find the scrollable parent
        const scrollContainer = (_a = containerRef.current) === null || _a === void 0 ? void 0 : _a.parentElement;
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll);
            window.addEventListener('resize', updateVisibleSymbols);
            return () => {
                scrollContainer.removeEventListener('scroll', handleScroll);
                window.removeEventListener('resize', updateVisibleSymbols);
                clearTimeout(scrollTimeout);
            };
        }
    }, [items, symbols, allSymbols]);
    const handleRowClick = useCallback((symbol) => {
        // Only toggle highlight if clicking on the row (not the symbol cell)
        startTransition(() => {
            setHighlightedSymbol(prevSymbol => {
                if (prevSymbol === symbol) {
                    // Prevent lingering browser text selection when deselecting the row
                    setTimeout(() => {
                        if (typeof window !== 'undefined') {
                            const selection = window.getSelection();
                            selection === null || selection === void 0 ? void 0 : selection.removeAllRanges();
                        }
                    }, 0);
                    return null;
                }
                return symbol;
            });
        });
    }, []);
    const handleSymbolClick = useCallback((symbol) => {
        // Handle symbol cell click - send to TradingView
        // Row highlighting is now handled by calling handleRowClick in StockRow
        if (onSymbolClick) {
            onSymbolClick(symbol);
        }
    }, [onSymbolClick]);
    const handleCheckboxChange = useCallback((symbol, checked) => {
        setSelectedSymbols(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(symbol);
            }
            else {
                newSet.delete(symbol);
            }
            return newSet;
        });
    }, []);
    const handleSelectAll = useCallback((checked) => {
        if (checked) {
            setSelectedSymbols(new Set(allSymbols));
        }
        else {
            setSelectedSymbols(new Set());
        }
    }, [allSymbols]);
    // Notify parent when selection changes
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(Array.from(selectedSymbols));
        }
    }, [selectedSymbols, onSelectionChange]);
    // Clear selection when exiting delete mode
    useEffect(() => {
        if (!deleteMode) {
            setSelectedSymbols(new Set());
        }
    }, [deleteMode]);
    // Handle column context menu
    const handleContextMenu = useCallback((e, columnKey) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            columnKey,
            type: 'column'
        });
    }, []);
    // Handle row context menu
    const handleRowContextMenu = useCallback((e, symbol, rowIndex) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            columnKey: null,
            type: 'row',
            rowIndex,
            symbol
        });
    }, []);
    const handleAutofitColumn = useCallback(() => {
        if (contextMenu.columnKey) {
            handleDoubleClick(contextMenu.columnKey);
        }
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
    }, [contextMenu.columnKey, handleDoubleClick]);
    const handleAutosizeAllColumns = useCallback(() => {
        // Autosize all columns by calling handleDoubleClick for each
        baseColumns.forEach(col => {
            handleDoubleClick(col.key);
        });
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
    }, [handleDoubleClick]);
    const handleDeleteRow = useCallback(() => {
        if (contextMenu.symbol) {
            onRemoveSymbol(contextMenu.symbol);
        }
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
    }, [contextMenu.symbol, onRemoveSymbol]);
    const handleAddHeaderRow = useCallback(() => {
        if (contextMenu.rowIndex !== undefined && onAddHeaderRow) {
            onAddHeaderRow(contextMenu.rowIndex);
        }
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
    }, [contextMenu.rowIndex, onAddHeaderRow]);
    const handleReorder = useCallback(() => {
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
        onReorderMode === null || onReorderMode === void 0 ? void 0 : onReorderMode();
    }, [onReorderMode]);
    const handleAddTickerRow = useCallback(() => {
        if (contextMenu.rowIndex !== undefined && onAddTickerRow) {
            onAddTickerRow(contextMenu.rowIndex);
        }
        setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
    }, [contextMenu.rowIndex, onAddTickerRow]);
    // Render placeholder row for inline editing
    const renderPlaceholderRow = () => {
        if (!placeholderRow)
            return null;
        const highlightColor = '#fce68a'; // Yellow highlight for ticker placeholder
        if (placeholderRow.type === 'header') {
            // Header placeholder with inline input - styled like a regular header row
            // Use same structure as normal header rows: just 2 td elements spanning all columns
            const inputColSpan = (deleteMode || reorderMode) ? 5 : 4; // More columns for better text visibility
            const remainingColSpan = columns.length - inputColSpan;
            return (_jsxs("tr", { className: "header-row", style: {
                    backgroundColor: 'rgb(var(--watchlist-surface-elevated))',
                    borderTop: '2px solid rgb(var(--watchlist-border))',
                    borderBottom: '1px solid rgb(var(--watchlist-border))',
                    height: '28px',
                    fontWeight: 'bold',
                    color: 'rgb(var(--watchlist-text-primary))'
                }, children: [_jsx("td", { colSpan: inputColSpan, style: {
                            padding: '0 4px',
                            verticalAlign: 'middle'
                        }, children: _jsx("input", { type: "text", placeholder: "Header name... (Esc to cancel)", autoFocus: true, style: {
                                width: '100%',
                                padding: '4px 8px',
                                border: '1px solid rgb(var(--watchlist-border))',
                                borderRadius: '3px',
                                fontSize: '20px',
                                fontWeight: 'bold',
                                color: 'rgb(var(--watchlist-text-primary))',
                                outline: 'none',
                                background: 'rgb(var(--watchlist-surface))',
                                height: '28px',
                                boxSizing: 'border-box'
                            }, onKeyDown: (e) => {
                                if (e.key === 'Enter') {
                                    const input = e.target;
                                    if (input.value.trim()) {
                                        onPlaceholderHeaderSave === null || onPlaceholderHeaderSave === void 0 ? void 0 : onPlaceholderHeaderSave(input.value);
                                    }
                                }
                                else if (e.key === 'Escape') {
                                    onPlaceholderCancel === null || onPlaceholderCancel === void 0 ? void 0 : onPlaceholderCancel();
                                }
                            } }) }), _jsx("td", { colSpan: remainingColSpan })] }, "placeholder-header"));
        }
        else {
            // Ticker placeholder - just a blank highlighted row
            // User will use the top search box to select ticker
            return (_jsx("tr", { style: { background: highlightColor, height: '28px' }, children: _jsx("td", { colSpan: columns.length, style: { padding: '8px', textAlign: 'left', color: '#666', fontStyle: 'italic' }, children: "Use the search box above to add a ticker... (Press Esc to cancel)" }) }, "placeholder-ticker"));
        }
    };
    // Render context menu based on type
    const renderContextMenu = () => {
        if (!contextMenu.visible)
            return null;
        const menuItemStyle = {
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#333'
        };
        return (_jsx("div", { style: {
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                background: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10000,
                minWidth: '140px'
            }, onClick: (e) => e.stopPropagation(), children: contextMenu.type === 'column' ? (
            // Column context menu
            _jsxs(_Fragment, { children: [_jsx("div", { style: menuItemStyle, onMouseEnter: (e) => { e.currentTarget.style.background = '#f0f0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleAutofitColumn, children: "Autosize this Column" }), _jsx("div", { style: Object.assign(Object.assign({}, menuItemStyle), { borderTop: '1px solid #eee' }), onMouseEnter: (e) => { e.currentTarget.style.background = '#f0f0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleAutosizeAllColumns, children: "Autosize All Columns" })] })) : (
            // Row context menu
            _jsxs(_Fragment, { children: [_jsx("div", { style: menuItemStyle, onMouseEnter: (e) => { e.currentTarget.style.background = '#f0f0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleAddTickerRow, children: "Add Ticker Row" }), _jsx("div", { style: menuItemStyle, onMouseEnter: (e) => { e.currentTarget.style.background = '#f0f0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleAddHeaderRow, children: "Add Header Row" }), _jsx("div", { style: Object.assign(Object.assign({}, menuItemStyle), { borderTop: '1px solid #eee' }), onMouseEnter: (e) => { e.currentTarget.style.background = '#f0f0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleReorder, children: "Reorder" }), _jsx("div", { style: Object.assign(Object.assign({}, menuItemStyle), { borderTop: '1px solid #eee' }), onMouseEnter: (e) => { e.currentTarget.style.background = '#fff0f0'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, onClick: handleDeleteRow, children: "Delete Row" })] })) }));
    };
    // Clear highlighted symbol when placeholder is created
    useEffect(() => {
        if (placeholderRow) {
            setHighlightedSymbol(null);
        }
    }, [placeholderRow]);
    // Close context menu on click outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.visible) {
                setContextMenu({ visible: false, x: 0, y: 0, columnKey: null, type: 'column' });
            }
        };
        if (contextMenu.visible) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [contextMenu.visible]);
    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't handle keyboard navigation if the event is from an input field
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
                return;
            }
            // Only handle arrow keys when not in delete or reorder mode
            if (deleteMode || reorderMode)
                return;
            // Check if items exist
            if (!items || items.length === 0)
                return;
            // Filter out header items, keep only stocks
            const stockItems = items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.type === 'stock');
            if (stockItems.length === 0)
                return;
            // Get current highlighted index among stock items
            const currentStockIndex = highlightedSymbol
                ? stockItems.findIndex(({ item }) => item.symbol === highlightedSymbol)
                : -1;
            let newStockIndex = currentStockIndex;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentStockIndex === -1) {
                    // No selection, start at first stock
                    newStockIndex = 0;
                }
                else if (currentStockIndex < stockItems.length - 1) {
                    // Move down to next stock
                    newStockIndex = currentStockIndex + 1;
                }
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentStockIndex === -1) {
                    // No selection, start at last stock
                    newStockIndex = stockItems.length - 1;
                }
                else if (currentStockIndex > 0) {
                    // Move up to previous stock
                    newStockIndex = currentStockIndex - 1;
                }
            }
            else if (e.key === 'Enter' && highlightedSymbol) {
                // Press Enter to send symbol to TradingView
                e.preventDefault();
                if (onSymbolClick) {
                    onSymbolClick(highlightedSymbol);
                }
                return;
            }
            else {
                return; // Not a key we care about
            }
            // Update highlighted symbol if index changed
            if (newStockIndex !== currentStockIndex && newStockIndex >= 0 && newStockIndex < stockItems.length) {
                const newSymbol = stockItems[newStockIndex].item.symbol;
                const actualIndex = stockItems[newStockIndex].index;
                setHighlightedSymbol(newSymbol);
                // Scroll the row into view if needed
                const rows = document.querySelectorAll('.watchlist-table tbody tr');
                if (rows[actualIndex]) {
                    rows[actualIndex].scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                }
            }
        };
        // Add event listener
        window.addEventListener('keydown', handleKeyDown);
        // Cleanup
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [highlightedSymbol, items, deleteMode, reorderMode, onSymbolClick]);
    // Column configuration (moved before early returns)
    const baseColumns = [
        { key: 'symbol', label: SYMBOL_HEADER_LABEL },
        { key: 'news', label: 'News' },
        { key: 'lastTrade', label: 'Last Trade' },
        ...(showExtendedHours ? [{ key: 'extHours', label: 'Ext. Hours' }] : []),
        { key: 'change', label: 'Change' },
        { key: 'changePercent', label: '%' },
        { key: 'bid', label: 'Bid' },
        { key: 'ask', label: 'Ask' },
        { key: 'volume', label: 'Volume' },
        { key: 'low', label: 'Low' },
        { key: 'high', label: 'High' },
        { key: 'marketCap', label: 'M. Cap' },
        { key: 'peRatio', label: 'P/E (ttm)' },
        { key: 'exDate', label: 'Ex-Date' },
        { key: 'eps', label: 'EPS (ttm)' },
        { key: 'divYield', label: DIVIDEND_YIELD_HEADER_LABEL },
        { key: 'name', label: 'Description' }
    ];
    // Add control column on the left when in delete/reorder mode
    const columns = (deleteMode || reorderMode)
        ? [{ key: 'control', label: '' }, ...baseColumns]
        : baseColumns;
    // Total width for non-virtualized table (sum of column widths)
    const totalWidth = useMemo(() => {
        return columns.reduce((sum, col) => {
            // Control column is fixed 50px
            if (col.key === 'control')
                return sum + 50;
            return sum + (columnWidths[col.key] || 100);
        }, 0);
    }, [columns, columnWidths]);
    // Determine if we should use virtualization
    const useVirtualization = allSymbols.length >= VIRTUALIZATION_THRESHOLD;
    // Convert newsData and analystData to match VirtualizedTable format
    const newsDataFormatted = useMemo(() => {
        const formatted = {};
        Object.keys(newsData).forEach(symbol => {
            const meta = newsData[symbol];
            formatted[symbol] = {
                count: (meta && typeof meta.count === 'number') ? meta.count : 0,
                loading: (meta && typeof meta.loading === 'boolean') ? meta.loading : false
            };
        });
        return formatted;
    }, [newsData]);
    const rssNewsDataFormatted = useMemo(() => {
        const formatted = {};
        Object.keys(rssNewsData).forEach(symbol => {
            const meta = rssNewsData[symbol];
            formatted[symbol] = {
                count: (meta && typeof meta.count === 'number') ? meta.count : 0,
                loading: (meta && typeof meta.loading === 'boolean') ? meta.loading : false
            };
        });
        return formatted;
    }, [rssNewsData]);
    const analystDataFormatted = useMemo(() => {
        const formatted = {};
        Object.keys(analystData).forEach(symbol => {
            const meta = analystData[symbol];
            formatted[symbol] = {
                count: (meta && typeof meta.count === 'number') ? meta.count : 0,
                loading: (meta && typeof meta.loading === 'boolean') ? meta.loading : false
            };
        });
        return formatted;
    }, [analystData]);
    // Only show loading on initial load, not during updates
    if (isLoading && !hasLoadedOnce) {
        return (_jsx("table", { className: "watchlist-table", children: _jsx("tbody", { children: _jsx("tr", { children: _jsx("td", { colSpan: columns.length, className: "loading", style: { textAlign: 'center', padding: '20px' }, children: "Loading watchlist data..." }) }) }) }));
    }
    if (error && stockData.size === 0) {
        // If we have an error and no data at all, show error message with table
        return (_jsxs("div", { children: [_jsx(ApiErrorMessage, { error: error, onRetry: refresh }), _jsx("table", { className: "watchlist-table", children: _jsx("tbody", { children: _jsx("tr", { children: _jsx("td", { colSpan: columns.length, style: { textAlign: 'center', padding: '20px', color: '#666' }, children: "Unable to load market data. Please try again." }) }) }) })] }));
    }
    if (allSymbols.length === 0) {
        return (_jsx("table", { className: "watchlist-table", children: _jsx("tbody", { children: _jsx("tr", { children: _jsx("td", { colSpan: columns.length, style: { textAlign: 'center', padding: '20px', color: '#666' }, children: "No symbols in this watchlist. Add some to get started!" }) }) }) }));
    }
    // Use virtualized table for large watchlists (100+ symbols)
    if (useVirtualization && items) {
        return (_jsxs("div", { children: [error && stockData.size > 0 && (_jsx(ApiErrorMessage, { error: error, onRetry: refresh })), _jsx(DataSourceIndicator, { source: dataSource || 'live', lastUpdated: lastUpdated, className: "mb-2" }), _jsx(VirtualizedTable, { items: items, stockData: stockData, columnWidths: columnWidths, columns: columns, highlightedSymbol: highlightedSymbol, selectedSymbols: selectedSymbols, deleteMode: deleteMode, reorderMode: reorderMode, containerHeight: 800, newsData: newsDataFormatted, rssNewsData: rssNewsDataFormatted, analystData: analystDataFormatted, onCellClick: (symbol, columnKey) => {
                        // Handle different column clicks
                        if (columnKey === 'symbol') {
                            handleSymbolClick(symbol);
                        }
                        else {
                            handleRowClick(symbol);
                        }
                    }, onCheckboxChange: handleCheckboxChange, onSelectAll: handleSelectAll, onNewsClick: (symbol) => {
                        // TODO: Wire up news click handler
                    }, onHeaderContextMenu: handleContextMenu, onResizeStart: handleResizeStart, onDoubleClick: handleDoubleClick }), renderContextMenu()] }));
    }
    // Use traditional table for smaller watchlists (< 100 symbols)
    return (_jsxs("div", { children: [error && stockData.size > 0 && (_jsx(ApiErrorMessage, { error: error, onRetry: refresh })), _jsx(DataSourceIndicator, { source: dataSource || 'live', lastUpdated: lastUpdated, className: "mb-2" }), _jsx("div", { ref: containerRef, style: { overflowX: 'hidden' }, children: _jsxs("table", { className: "watchlist-table", ref: tableRef, style: { tableLayout: 'fixed', minWidth: totalWidth }, children: [_jsx("colgroup", { children: columns.map((col) => (_jsx("col", { style: {
                                    width: col.key === 'control' ? '50px' : `${columnWidths[col.key]}px`,
                                    minWidth: col.key === 'control' ? '50px' : undefined
                                } }, col.key))) }), _jsx("thead", { children: _jsx("tr", { children: columns.map((col, index) => (col.key === 'control' ? (_jsx("th", { style: {
                                        width: '50px',
                                        minWidth: '50px',
                                        maxWidth: '50px',
                                        padding: 0,
                                        position: 'relative',
                                        cursor: deleteMode ? 'pointer' : 'default'
                                    }, onClick: () => {
                                        if (deleteMode) {
                                            handleSelectAll(!(selectedSymbols.size === allSymbols.length && allSymbols.length > 0));
                                        }
                                    }, children: deleteMode && (_jsx("input", { type: "checkbox", checked: selectedSymbols.size === allSymbols.length && allSymbols.length > 0, onChange: () => { }, style: {
                                            cursor: 'pointer',
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%) scale(1.3)',
                                            margin: 0,
                                            width: '18px',
                                            height: '18px',
                                            pointerEvents: 'none' // Prevent double-firing
                                        } })) }, col.key)) : (_jsxs("th", { className: `${col.key} ${col.key === 'news' ? 'news' : ''} ${col.key === 'symbol' ? 'symbol' : ''}`, style: {
                                        position: 'relative',
                                        textAlign: col.key === 'symbol' || col.key === 'name' ? 'left' : undefined,
                                        textTransform: col.key === 'symbol' ? 'capitalize' : undefined
                                    }, onContextMenu: (e) => handleContextMenu(e, col.key), children: [col.label, index < columns.length - 1 && (_jsx("span", { className: "col-resizer", onPointerDown: (e) => handleResizeStart(e, col.key, index), onDoubleClick: () => handleDoubleClick(col.key), style: {
                                                position: 'absolute',
                                                right: '-5px',
                                                top: 0,
                                                bottom: 0,
                                                width: '10px',
                                                cursor: 'col-resize',
                                                zIndex: 1,
                                                userSelect: 'none',
                                                background: 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }, children: _jsx("span", { style: {
                                                    width: '2px',
                                                    height: '70%',
                                                    background: isResizing && index === columns.indexOf(columns.find(c => c.key === col.key))
                                                        ? '#2962ff'
                                                        : 'transparent',
                                                    transition: 'background 0.2s'
                                                } }) })), index > 0 && (_jsx("span", { className: "col-resizer left", onPointerDown: (e) => handleResizeStart(e, col.key, index, 'left'), style: {
                                                position: 'absolute',
                                                left: '-5px',
                                                top: 0,
                                                bottom: 0,
                                                width: '10px',
                                                cursor: 'col-resize',
                                                zIndex: 1,
                                                userSelect: 'none',
                                                background: 'transparent'
                                            } }))] }, col.key)))) }) }), _jsx("tbody", { children: items ? (
                            // New format with items array
                            (() => {
                                const rows = [];
                                items.forEach((item, index) => {
                                    // Insert placeholder row at the specified index
                                    if (placeholderRow && placeholderRow.index === index) {
                                        rows.push(renderPlaceholderRow());
                                    }
                                    const normalizedSymbol = normalizeSymbol(item.symbol);
                                    const stock = isStock(item) ? stockData.get(normalizedSymbol) : undefined;
                                    const isSelected = selectedSymbols.has(item.symbol);
                                    rows.push(_jsx(StockRow, { symbol: item.symbol, stock: stock, isHeader: isHeader(item), isHighlighted: highlightedSymbol === item.symbol, deleteMode: deleteMode, reorderMode: reorderMode, isSelected: isSelected, isDragging: draggedIndex === index, isDropTarget: dropIndex === index, dropPosition: dropPosition, index: index, newsMeta: newsData[item.symbol], rssNewsMeta: rssNewsData[item.symbol], analystMeta: analystData[item.symbol], fetchArticles: fetchArticles, fetchRSSArticles: fetchRSSArticles, prefetchRSSArticles: prefetchRSSArticles, prefetchArticles: prefetchArticles, onShowNewsModal: onShowNewsModal, onShowAnalystModal: onShowAnalystModal, onCheckboxChange: (checked) => handleCheckboxChange(item.symbol, checked), onRowClick: () => handleRowClick(item.symbol), onSymbolClick: () => handleSymbolClick(item.symbol), onRemove: () => onRemoveSymbol(item.symbol), onRename: isHeader(item) ? (newName) => onRenameHeader === null || onRenameHeader === void 0 ? void 0 : onRenameHeader(item.symbol, newName) : undefined, onContextMenu: handleRowContextMenu, onDragStart: () => onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart(index), onDragOver: (e) => onDragOver === null || onDragOver === void 0 ? void 0 : onDragOver(e, index), onDrop: (e) => onDrop === null || onDrop === void 0 ? void 0 : onDrop(e, index), onDragEnd: onDragEnd, onDragLeave: onDragLeave, showExtendedHours: showExtendedHours }, `${item.type}_${item.symbol}_${index}`));
                                });
                                // If placeholder index is at the end (beyond last item), add it at the end
                                if (placeholderRow && placeholderRow.index >= items.length) {
                                    rows.push(renderPlaceholderRow());
                                }
                                return rows;
                            })()) : (
                            // Old format with symbols array (backward compatibility)
                            symbols.map((symbol, index) => {
                                const normalizedSymbol = normalizeSymbol(symbol);
                                const stock = stockData.get(normalizedSymbol);
                                return (_jsx(StockRow, { symbol: symbol, stock: stock, isHeader: false, isHighlighted: highlightedSymbol === symbol, deleteMode: deleteMode, reorderMode: reorderMode, isSelected: selectedSymbols.has(symbol), isDragging: draggedIndex === index, isDropTarget: dropIndex === index, dropPosition: dropPosition, index: index, newsMeta: newsData[symbol], rssNewsMeta: rssNewsData[symbol], analystMeta: analystData[symbol], fetchArticles: fetchArticles, fetchRSSArticles: fetchRSSArticles, prefetchRSSArticles: prefetchRSSArticles, prefetchArticles: prefetchArticles, onShowNewsModal: onShowNewsModal, onShowAnalystModal: onShowAnalystModal, onCheckboxChange: (checked) => handleCheckboxChange(symbol, checked), onRowClick: () => handleRowClick(symbol), onSymbolClick: () => handleSymbolClick(symbol), onRemove: () => onRemoveSymbol(symbol), onContextMenu: handleRowContextMenu, onDragStart: () => onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart(index), onDragOver: (e) => onDragOver === null || onDragOver === void 0 ? void 0 : onDragOver(e, index), onDrop: (e) => onDrop === null || onDrop === void 0 ? void 0 : onDrop(e, index), onDragEnd: onDragEnd, onDragLeave: onDragLeave, showExtendedHours: showExtendedHours }, symbol));
                            })) })] }) }), renderContextMenu()] }));
});
export default WatchlistTable;
