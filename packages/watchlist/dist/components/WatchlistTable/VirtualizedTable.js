'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useMemo, useRef } from 'react';
import { Grid } from 'react-window';
import TableCell from './TableCell';
import { isStock, isHeader } from '@watchlist/utils/watchlist-helpers';
const ROW_HEIGHT = 40; // Fixed row height in pixels
const HEADER_HEIGHT = 40; // Fixed header height
const VirtualizedTable = memo(function VirtualizedTable({ items, stockData, columnWidths, columns, highlightedSymbol, selectedSymbols, deleteMode = false, reorderMode = false, containerHeight = 800, // Default height, can be overridden
newsData = {}, rssNewsData = {}, analystData = {}, onCellClick, onCheckboxChange, onSelectAll, onNewsClick, onHeaderContextMenu, onResizeStart, onDoubleClick }) {
    const gridRef = useRef(null);
    // Calculate total width
    const totalWidth = useMemo(() => {
        return columns.reduce((sum, col) => {
            return sum + (columnWidths[col.key] || 100);
        }, 0);
    }, [columns, columnWidths]);
    // Column width getter for FixedSizeGrid
    const getColumnWidth = useCallback((index) => {
        const column = columns[index];
        if (!column)
            return 100;
        return columnWidths[column.key] || 100;
    }, [columns, columnWidths]);
    // Cell renderer for Grid
    const cellComponent = useCallback(({ columnIndex, rowIndex, style }) => {
        const column = columns[columnIndex];
        const item = items[rowIndex];
        if (!column || !item) {
            return _jsx("div", { style: style });
        }
        // Get stock data if this is a stock item
        const rowData = isStock(item) ? stockData.get(item.symbol) : null;
        const isHighlighted = highlightedSymbol === item.symbol;
        const isSelected = selectedSymbols.has(item.symbol);
        const isHeaderRow = isHeader(item);
        // Get news metadata for this symbol
        const newsMeta = newsData[item.symbol];
        const rssNewsMeta = rssNewsData[item.symbol];
        const analystMeta = analystData[item.symbol];
        // Handle cell click
        const handleCellClick = () => {
            if (onCellClick) {
                onCellClick(item.symbol, column.key);
            }
        };
        // Handle checkbox change
        const handleCheckboxChange = (checked) => {
            if (onCheckboxChange) {
                onCheckboxChange(item.symbol, checked);
            }
        };
        // Handle news click
        const handleNewsClick = () => {
            if (onNewsClick) {
                onNewsClick(item.symbol);
            }
        };
        return (_jsx(TableCell, { style: style, columnKey: column.key, rowData: rowData, isHeader: isHeaderRow, isHighlighted: isHighlighted, isSelected: isSelected, deleteMode: deleteMode, reorderMode: reorderMode, newsMeta: newsMeta, rssNewsMeta: rssNewsMeta, analystMeta: analystMeta, onCellClick: handleCellClick, onCheckboxChange: handleCheckboxChange, onNewsClick: handleNewsClick }));
    }, [
        columns,
        items,
        stockData,
        highlightedSymbol,
        selectedSymbols,
        deleteMode,
        reorderMode,
        newsData,
        rssNewsData,
        analystData,
        onCellClick,
        onCheckboxChange,
        onNewsClick
    ]);
    // Render fixed header row
    const renderHeader = () => {
        // Count stock symbols (not headers) for "Select All" checkbox
        const stockCount = items.filter(isStock).length;
        const allSelected = selectedSymbols.size === stockCount && stockCount > 0;
        return (_jsx("div", { style: {
                display: 'flex',
                width: totalWidth,
                height: HEADER_HEIGHT,
                backgroundColor: '#f8f9fa',
                borderBottom: '2px solid #e0e0e0',
                position: 'sticky',
                top: 0,
                zIndex: 10
            }, children: columns.map((col, index) => {
                const width = columnWidths[col.key] || 100;
                // Handle control column header (checkbox for "Select All")
                if (col.key === 'control') {
                    return (_jsx("div", { style: {
                            width: 50,
                            minWidth: 50,
                            height: HEADER_HEIGHT,
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: '1px solid #f0f0f0',
                            position: 'relative',
                            cursor: deleteMode ? 'pointer' : 'default'
                        }, onClick: () => {
                            if (deleteMode && onSelectAll) {
                                onSelectAll(!allSelected);
                            }
                        }, children: deleteMode && (_jsx("input", { type: "checkbox", checked: allSelected, onChange: () => { }, style: {
                                cursor: 'pointer',
                                width: '18px',
                                height: '18px',
                                margin: 0,
                                pointerEvents: 'none'
                            } })) }, col.key));
                }
                return (_jsxs("div", { style: {
                        width,
                        minWidth: width,
                        height: HEADER_HEIGHT,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: col.key === 'symbol' || col.key === 'name' ? 'flex-start' : 'flex-end',
                        borderRight: index < columns.length - 1 ? '1px solid #f0f0f0' : 'none',
                        position: 'relative',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textTransform: col.key === 'symbol' ? 'capitalize' : undefined
                    }, onContextMenu: (e) => {
                        if (onHeaderContextMenu) {
                            onHeaderContextMenu(e, col.key);
                        }
                    }, children: [col.label, index < columns.length - 1 && onResizeStart && (_jsx("span", { className: "col-resizer", onPointerDown: (e) => onResizeStart(e, col.key, index), onDoubleClick: () => onDoubleClick === null || onDoubleClick === void 0 ? void 0 : onDoubleClick(col.key), style: {
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
                                    background: 'transparent',
                                    transition: 'background 0.2s'
                                } }) }))] }, col.key));
            }) }));
    };
    // Calculate visible row count (aim for 100 rows visible)
    const visibleRowCount = Math.floor((containerHeight - HEADER_HEIGHT) / ROW_HEIGHT);
    const effectiveHeight = containerHeight - HEADER_HEIGHT;
    return (_jsxs("div", { style: { height: containerHeight, width: '100%', overflow: 'hidden' }, children: [renderHeader(), _jsx(Grid, { gridRef: gridRef, cellComponent: cellComponent, cellProps: {}, columnCount: columns.length, columnWidth: getColumnWidth, rowCount: items.length, rowHeight: ROW_HEIGHT, overscanCount: 5, style: {
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    height: effectiveHeight,
                    width: totalWidth
                } })] }));
});
export default VirtualizedTable;
