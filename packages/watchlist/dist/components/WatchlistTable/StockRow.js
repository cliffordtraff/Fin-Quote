'use client';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useEffect, useRef, useState } from 'react';
import NewsIndicator from '@watchlist/components/NewsIndicator';
import { formatDividendYield } from '@watchlist/utils/formatters';
// Helper function to format numbers
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined)
        return 'N/A';
    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}
// Helper function to format large numbers
function formatLargeNumber(num) {
    if (num === null || num === undefined)
        return 'N/A';
    if (num >= 1e9) {
        const billions = num / 1e9;
        // If over 1 trillion (1000B), don't show decimals
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
// Format date as MM/DD/YY
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
// News functionality will be implemented with real data in Phase 1
// No mock news - only show icons when we have real news from FMP API
// Memoized component that only re-renders when its props change
const StockRow = memo(function StockRow({ symbol, stock, isHeader = false, isHighlighted, deleteMode = false, reorderMode = false, isSelected = false, isDragging = false, isDropTarget = false, dropPosition = null, index, newsMeta, rssNewsMeta, analystMeta, fetchArticles, fetchRSSArticles, prefetchArticles, prefetchRSSArticles, onShowNewsModal, onShowAnalystModal, onCheckboxChange, onRowClick, onSymbolClick, onRemove, onRename, onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave, showExtendedHours = false }) {
    var _a;
    const rowRef = useRef(null);
    const prevPriceRef = useRef(stock === null || stock === void 0 ? void 0 : stock.price);
    const [rssArticles, setRssArticles] = useState((rssNewsMeta === null || rssNewsMeta === void 0 ? void 0 : rssNewsMeta.articles) || []);
    const hoverTimeoutRef = useRef(null);
    // Track previous price (keeping for potential future use)
    useEffect(() => {
        prevPriceRef.current = stock === null || stock === void 0 ? void 0 : stock.price;
    }, [stock === null || stock === void 0 ? void 0 : stock.price]);
    // Update RSS articles when prop changes
    useEffect(() => {
        if ((rssNewsMeta === null || rssNewsMeta === void 0 ? void 0 : rssNewsMeta.articles) && rssNewsMeta.articles.length > 0) {
            setRssArticles(rssNewsMeta.articles);
        }
    }, [rssNewsMeta, symbol]);
    const handleNewsClick = () => __awaiter(this, void 0, void 0, function* () {
        if (rssArticles.length > 0) {
            onShowNewsModal === null || onShowNewsModal === void 0 ? void 0 : onShowNewsModal({ symbol, articles: rssArticles, loading: false });
            return;
        }
        onShowNewsModal === null || onShowNewsModal === void 0 ? void 0 : onShowNewsModal({ symbol, articles: [], loading: true });
        if (fetchRSSArticles) {
            try {
                const articles = yield fetchRSSArticles(symbol);
                setRssArticles(articles);
                onShowNewsModal === null || onShowNewsModal === void 0 ? void 0 : onShowNewsModal({ symbol, articles, loading: false });
            }
            catch (error) {
                console.error('Failed to fetch RSS articles:', error);
                setRssArticles([]);
                onShowNewsModal === null || onShowNewsModal === void 0 ? void 0 : onShowNewsModal({ symbol, articles: [], loading: false });
            }
        }
        else {
            onShowNewsModal === null || onShowNewsModal === void 0 ? void 0 : onShowNewsModal({ symbol, articles: [], loading: false });
        }
    });
    const handleAnalystClick = () => __awaiter(this, void 0, void 0, function* () {
        onShowAnalystModal === null || onShowAnalystModal === void 0 ? void 0 : onShowAnalystModal({ symbol, changes: [], loading: true });
        try {
            const response = yield fetch(`/api/analyst/details?symbol=${symbol}`);
            const data = yield response.json();
            onShowAnalystModal === null || onShowAnalystModal === void 0 ? void 0 : onShowAnalystModal({ symbol, changes: data.changes || [], loading: false });
        }
        catch (error) {
            console.error('Failed to fetch analyst details:', error);
            onShowAnalystModal === null || onShowAnalystModal === void 0 ? void 0 : onShowAnalystModal({ symbol, changes: [], loading: false });
        }
    });
    // Header row rendering
    if (isHeader) {
        return (_jsxs("tr", { ref: rowRef, className: "header-row bg-watchlist-surface-elevated", draggable: reorderMode, style: Object.assign(Object.assign(Object.assign({ cursor: reorderMode ? 'move' : 'default', fontWeight: 'bold', borderTop: '2px solid rgb(var(--watchlist-border))', borderBottom: '1px solid rgb(var(--watchlist-border))' }, (isDragging ? { opacity: 0.5 } : {})), (dropPosition === 'before' ? { borderTop: '3px solid #2196F3' } : {})), (dropPosition === 'after' ? { borderBottom: '3px solid #2196F3' } : {})), onContextMenu: (e) => {
                var _a, _b;
                e.preventDefault();
                // Remove any existing context menu
                const existingMenu = document.getElementById('headerContextMenu');
                if (existingMenu) {
                    existingMenu.remove();
                }
                // Create context menu
                const contextMenu = document.createElement('div');
                contextMenu.id = 'headerContextMenu';
                contextMenu.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 4px 0;
            min-width: 150px;
          `;
                contextMenu.innerHTML = `
            <div id="renameOption" style="
              padding: 8px 16px;
              cursor: pointer;
              color: #333;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1px solid #eee;
            " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='transparent'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Rename Header Row
            </div>
            <div id="deleteOption" style="
              padding: 8px 16px;
              cursor: pointer;
              color: #333;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
            " onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor='transparent'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </div>
          `;
                document.body.appendChild(contextMenu);
                // Handle rename option click
                (_a = contextMenu.querySelector('#renameOption')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
                    var _a, _b;
                    contextMenu.remove();
                    // Show rename dialog
                    const renameDialog = document.createElement('div');
                    renameDialog.style.cssText = `
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: white;
              border: 2px solid #888c94;
              border-radius: 8px;
              padding: 20px;
              z-index: 10000;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
              min-width: 350px;
              text-align: center;
            `;
                    const backdrop = document.createElement('div');
                    backdrop.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0,0,0,0.5);
              z-index: 9999;
            `;
                    renameDialog.innerHTML = `
              <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">Rename Header</h3>
              <input 
                id="renameInput" 
                type="text" 
                value="${symbol}"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 2px solid #888c94;
                  border-radius: 6px;
                  font-size: 14px;
                  margin-bottom: 20px;
                  box-sizing: border-box;
                  outline: none;
                "
              />
              <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="confirmRename" style="
                  background: #4caf50;
                  color: white;
                  border: none;
                  padding: 8px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: bold;
                  font-size: 14px;
                ">Rename</button>
                <button id="cancelRename" style="
                  background: white;
                  color: #333;
                  border: 2px solid #888c94;
                  padding: 8px 20px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: bold;
                  font-size: 14px;
                ">Cancel</button>
              </div>
            `;
                    document.body.appendChild(backdrop);
                    document.body.appendChild(renameDialog);
                    // Focus and select the input
                    const input = renameDialog.querySelector('#renameInput');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                    const cleanup = () => {
                        document.body.removeChild(backdrop);
                        document.body.removeChild(renameDialog);
                    };
                    const handleRename = () => {
                        var _a;
                        const newName = (_a = renameDialog.querySelector('#renameInput')) === null || _a === void 0 ? void 0 : _a.value;
                        if (newName && newName.trim() && newName.trim() !== symbol) {
                            cleanup();
                            onRename === null || onRename === void 0 ? void 0 : onRename(newName.trim());
                        }
                    };
                    // Handle button clicks
                    (_a = renameDialog.querySelector('#confirmRename')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', handleRename);
                    (_b = renameDialog.querySelector('#cancelRename')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', cleanup);
                    backdrop.addEventListener('click', cleanup);
                    // Handle Enter key
                    input === null || input === void 0 ? void 0 : input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            handleRename();
                        }
                    });
                    // Handle Escape key
                    input === null || input === void 0 ? void 0 : input.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            cleanup();
                        }
                    });
                });
                // Handle delete option click
                (_b = contextMenu.querySelector('#deleteOption')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
                    contextMenu.remove();
                    onRemove(); // Delete immediately without confirmation
                });
                // Close context menu when clicking elsewhere
                const closeMenu = (event) => {
                    if (!contextMenu.contains(event.target)) {
                        contextMenu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                // Add slight delay to prevent immediate closure
                setTimeout(() => {
                    document.addEventListener('click', closeMenu);
                }, 10);
            }, onDragStart: (e) => {
                if (reorderMode) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', '');
                    onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart();
                }
            }, onDragOver: onDragOver, onDrop: onDrop, onDragEnd: onDragEnd, onDragLeave: onDragLeave, children: [(deleteMode || reorderMode) && (_jsxs("td", { style: {
                        textAlign: 'center',
                        padding: 0,
                        position: 'relative',
                        verticalAlign: 'middle',
                        cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
                    }, onClick: (e) => {
                        e.stopPropagation();
                        if (deleteMode) {
                            requestAnimationFrame(() => {
                                onCheckboxChange === null || onCheckboxChange === void 0 ? void 0 : onCheckboxChange(!isSelected);
                            });
                        }
                    }, children: [deleteMode && (_jsx("input", { type: "checkbox", checked: isSelected, onChange: () => { }, style: {
                                cursor: 'pointer',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) scale(1.3)',
                                margin: 0,
                                width: '18px',
                                height: '18px',
                                pointerEvents: 'none' // Prevent double-firing
                            } })), reorderMode && (_jsx("span", { style: {
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                display: 'inline-block',
                                width: '24px',
                                height: '24px',
                                cursor: 'move',
                                pointerEvents: 'none',
                                color: 'rgb(var(--watchlist-text-primary))'
                            }, children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: { pointerEvents: 'none' }, children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "5.01" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "12.01" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "19.01" }), _jsx("line", { x1: "7", y1: "5", x2: "7", y2: "5.01" }), _jsx("line", { x1: "7", y1: "12", x2: "7", y2: "12.01" }), _jsx("line", { x1: "7", y1: "19", x2: "7", y2: "19.01" }), _jsx("line", { x1: "17", y1: "5", x2: "17", y2: "5.01" }), _jsx("line", { x1: "17", y1: "12", x2: "17", y2: "12.01" }), _jsx("line", { x1: "17", y1: "19", x2: "17", y2: "19.01" })] }) }))] })), _jsx("td", { className: "symbol", colSpan: deleteMode || reorderMode ? 1 : 2, style: { paddingLeft: '10px', borderRight: 'none', borderLeft: 'none' }, children: symbol }), _jsx("td", { colSpan: deleteMode || reorderMode ? 15 : 14, style: { borderLeft: 'none', borderRight: 'none' } })] }));
    }
    // Loading state for symbol without data yet
    if (!stock && !isHeader) {
        return (_jsxs("tr", { ref: rowRef, draggable: reorderMode, style: {
                cursor: reorderMode ? 'move' : 'pointer',
                opacity: isDragging ? 0.5 : 1
            }, onContextMenu: (e) => {
                // Highlight the row when right-clicking
                if (!isHighlighted) {
                    onRowClick();
                }
                onContextMenu === null || onContextMenu === void 0 ? void 0 : onContextMenu(e, symbol, index !== null && index !== void 0 ? index : 0);
            }, onDragStart: (e) => {
                if (reorderMode) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', '');
                    onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart();
                }
            }, onDragOver: (e) => {
                e.preventDefault(); // Always prevent default to allow drop
                if (reorderMode) {
                    onDragOver === null || onDragOver === void 0 ? void 0 : onDragOver(e);
                }
            }, onDrop: (e) => {
                if (reorderMode) {
                    e.preventDefault();
                    onDrop === null || onDrop === void 0 ? void 0 : onDrop(e);
                }
            }, onDragLeave: (e) => {
                if (reorderMode) {
                    e.preventDefault();
                    onDragLeave === null || onDragLeave === void 0 ? void 0 : onDragLeave();
                }
            }, children: [(deleteMode || reorderMode) && (_jsxs("td", { style: {
                        textAlign: 'center',
                        padding: 0,
                        position: 'relative',
                        verticalAlign: 'middle',
                        cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
                    }, onClick: (e) => {
                        e.stopPropagation();
                        if (deleteMode) {
                            requestAnimationFrame(() => {
                                onCheckboxChange === null || onCheckboxChange === void 0 ? void 0 : onCheckboxChange(!isSelected);
                            });
                        }
                    }, children: [deleteMode && (_jsx("input", { type: "checkbox", checked: isSelected, onChange: () => { }, style: {
                                cursor: 'pointer',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) scale(1.3)',
                                margin: 0,
                                width: '18px',
                                height: '18px',
                                pointerEvents: 'none' // Prevent double-firing
                            } })), reorderMode && (_jsx("span", { style: {
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                display: 'inline-block',
                                width: '24px',
                                height: '24px',
                                cursor: 'move',
                                pointerEvents: 'none',
                                color: 'rgb(var(--watchlist-text-primary))'
                            }, children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: { pointerEvents: 'none' }, children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "5.01" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "12.01" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "19.01" }), _jsx("line", { x1: "7", y1: "5", x2: "7", y2: "5.01" }), _jsx("line", { x1: "7", y1: "12", x2: "7", y2: "12.01" }), _jsx("line", { x1: "7", y1: "19", x2: "7", y2: "19.01" }), _jsx("line", { x1: "17", y1: "5", x2: "17", y2: "5.01" }), _jsx("line", { x1: "17", y1: "12", x2: "17", y2: "12.01" }), _jsx("line", { x1: "17", y1: "19", x2: "17", y2: "19.01" })] }) }))] })), _jsx("td", { className: "symbol", children: symbol }), _jsx("td", { className: "news" }), _jsx("td", { colSpan: deleteMode || reorderMode ? 14 : 14, style: { textAlign: 'center', color: '#666' }, children: "Loading..." })] }));
    }
    // If no stock data is available, show loading state
    if (!stock) {
        return (_jsxs("tr", { className: isHighlighted ? 'row-highlight' : '', draggable: reorderMode, style: {
                cursor: reorderMode ? 'move' : 'default'
            }, onContextMenu: (e) => {
                // Highlight the row when right-clicking
                if (!isHighlighted) {
                    onRowClick();
                }
                onContextMenu === null || onContextMenu === void 0 ? void 0 : onContextMenu(e, symbol, index !== null && index !== void 0 ? index : 0);
            }, onDragStart: (e) => {
                if (reorderMode) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', '');
                    onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart();
                }
            }, children: [(deleteMode || reorderMode) && _jsx("td", {}), _jsx("td", { className: "symbol", children: symbol }), _jsx("td", { className: "news" }), _jsx("td", { colSpan: deleteMode || reorderMode ? 14 : 14, style: { textAlign: 'center', color: '#666' }, children: "Loading..." })] }));
    }
    const isPositive = stock.change >= 0;
    const extendedHoursQuote = stock.extendedHoursQuote;
    const extendedHoursChangePercent = (_a = extendedHoursQuote === null || extendedHoursQuote === void 0 ? void 0 : extendedHoursQuote.changePercent) !== null && _a !== void 0 ? _a : 0;
    const extendedHoursPercentDisplay = `${extendedHoursChangePercent >= 0 ? '+' : '-'}${formatNumber(Math.abs(extendedHoursChangePercent))}%`;
    const tableRow = (_jsxs("tr", { ref: rowRef, className: isHighlighted ? 'row-highlight' : '', onClick: onRowClick, draggable: reorderMode, style: {
            cursor: reorderMode ? 'move' : 'pointer',
            opacity: isDragging ? 0.5 : 1
        }, onContextMenu: (e) => {
            // Highlight the row when right-clicking
            if (!isHighlighted) {
                onRowClick();
            }
            onContextMenu === null || onContextMenu === void 0 ? void 0 : onContextMenu(e, symbol, index !== null && index !== void 0 ? index : 0);
        }, onDragStart: (e) => {
            if (reorderMode) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', '');
                onDragStart === null || onDragStart === void 0 ? void 0 : onDragStart();
            }
        }, onDragOver: (e) => {
            e.preventDefault(); // Always prevent default to allow drop
            if (reorderMode) {
                onDragOver === null || onDragOver === void 0 ? void 0 : onDragOver(e);
            }
        }, onDrop: (e) => {
            if (reorderMode) {
                e.preventDefault();
                onDrop === null || onDrop === void 0 ? void 0 : onDrop(e);
            }
        }, onDragEnd: (e) => {
            if (reorderMode && isDragging) {
                e.preventDefault();
                onDragEnd === null || onDragEnd === void 0 ? void 0 : onDragEnd();
            }
        }, onDragLeave: (e) => {
            if (reorderMode) {
                e.preventDefault();
                onDragLeave === null || onDragLeave === void 0 ? void 0 : onDragLeave();
            }
        }, children: [(deleteMode || reorderMode) && (_jsxs("td", { style: {
                    textAlign: 'center',
                    padding: 0,
                    position: 'relative',
                    verticalAlign: 'middle',
                    cursor: reorderMode ? 'move' : (deleteMode ? 'pointer' : 'default')
                }, onClick: (e) => {
                    e.stopPropagation();
                    if (deleteMode) {
                        requestAnimationFrame(() => {
                            onCheckboxChange === null || onCheckboxChange === void 0 ? void 0 : onCheckboxChange(!isSelected);
                        });
                    }
                }, children: [deleteMode && (_jsx("input", { type: "checkbox", checked: isSelected, onChange: () => { }, style: {
                            cursor: 'pointer',
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) scale(1.3)',
                            margin: 0,
                            width: '18px',
                            height: '18px',
                            pointerEvents: 'none', // Prevent double-firing
                            background: 'rgb(var(--watchlist-surface))',
                            border: '1px solid rgb(var(--watchlist-border))',
                            borderRadius: '4px'
                        } })), reorderMode && (_jsx("span", { style: {
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            display: 'inline-block',
                            width: '24px',
                            height: '24px',
                            cursor: 'move',
                            pointerEvents: 'none',
                            color: 'rgb(var(--watchlist-text-primary))'
                        }, children: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: { pointerEvents: 'none' }, children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "5.01" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "12.01" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "19.01" }), _jsx("line", { x1: "7", y1: "5", x2: "7", y2: "5.01" }), _jsx("line", { x1: "7", y1: "12", x2: "7", y2: "12.01" }), _jsx("line", { x1: "7", y1: "19", x2: "7", y2: "19.01" }), _jsx("line", { x1: "17", y1: "5", x2: "17", y2: "5.01" }), _jsx("line", { x1: "17", y1: "12", x2: "17", y2: "12.01" }), _jsx("line", { x1: "17", y1: "19", x2: "17", y2: "19.01" })] }) }))] })), _jsx("td", { className: "symbol", onClick: (e) => {
                    if (reorderMode)
                        return;
                    e.stopPropagation();
                    // Only set highlight if not already highlighted (don't toggle)
                    if (!isHighlighted) {
                        onRowClick();
                    }
                    // Send to TradingView
                    onSymbolClick();
                }, style: { cursor: reorderMode ? 'move' : 'pointer' }, children: _jsx("span", { style: {
                        cursor: reorderMode ? 'move' : 'pointer'
                    }, children: stock.symbol }) }), _jsx("td", { className: "news", style: { cursor: reorderMode ? 'move' : 'pointer' }, onClick: (e) => {
                    if (reorderMode) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }, children: _jsx("div", { style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        justifyContent: 'center',
                        height: '28px',
                        maxHeight: '28px',
                        overflow: 'hidden'
                    }, children: _jsx(NewsIndicator, { news: (rssNewsMeta === null || rssNewsMeta === void 0 ? void 0 : rssNewsMeta.latestArticle) || null, newsCount: (rssNewsMeta === null || rssNewsMeta === void 0 ? void 0 : rssNewsMeta.count) || 0, fmpNewsCount: (newsMeta === null || newsMeta === void 0 ? void 0 : newsMeta.count) || 0, onNewsClick: reorderMode ? undefined : handleNewsClick, fetchFMPArticles: fetchArticles, prefetchArticles: reorderMode ? undefined : () => __awaiter(this, void 0, void 0, function* () { prefetchRSSArticles === null || prefetchRSSArticles === void 0 ? void 0 : prefetchRSSArticles(symbol); }), symbol: symbol, allArticles: rssArticles }) }) }), _jsx("td", { className: "price", children: formatNumber(stock.price) }), showExtendedHours && (_jsx("td", { className: "price", style: { whiteSpace: 'nowrap' }, children: extendedHoursQuote ? (_jsxs("div", { style: {
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        whiteSpace: 'nowrap'
                    }, children: [_jsx("span", { children: formatNumber(extendedHoursQuote.price) }), _jsxs("span", { style: {
                                fontSize: '0.85em',
                                color: extendedHoursChangePercent >= 0 ? '#008f3b' : 'rgb(var(--watchlist-change-negative))'
                            }, children: ["(", extendedHoursPercentDisplay, ")"] })] })) : (_jsx("span", { style: { color: '#999', fontSize: '0.85em' }, children: "N/A" })) })), _jsxs("td", { className: "change", style: { color: isPositive ? '#008f3b' : 'rgb(var(--watchlist-change-negative))' }, children: [isPositive && '+', formatNumber(stock.change)] }), _jsxs("td", { className: "change", style: { color: isPositive ? '#008f3b' : 'rgb(var(--watchlist-change-negative))' }, children: [formatNumber(Math.abs(stock.changePercent)), "%"] }), _jsx("td", { className: "price", children: formatNumber(stock.bid) }), _jsx("td", { className: "price", children: formatNumber(stock.ask) }), _jsx("td", { className: "volume", children: formatLargeNumber(stock.volume) }), _jsx("td", { className: "price", children: formatNumber(stock.dayLow) }), _jsx("td", { className: "price", children: formatNumber(stock.dayHigh) }), _jsx("td", { className: "volume", children: formatLargeNumber(stock.marketCap) }), _jsx("td", { className: "price", children: stock.peRatio ? formatNumber(stock.peRatio) : 'N/A' }), _jsx("td", { children: !stock ? (
                // Stock data not loaded yet
                _jsx("span", { style: { fontWeight: 300, color: '#999' }, children: "..." })) : (stock === null || stock === void 0 ? void 0 : stock.exDividendDate) === undefined ? (
                // Dividend data loading
                _jsx("span", { style: { fontWeight: 300, color: '#666' }, children: "..." })) : (stock === null || stock === void 0 ? void 0 : stock.exDividendDate) ? (
                // Dividend data loaded
                formatExDate(stock.exDividendDate)) : (
                // No dividend
                _jsx("span", { style: { fontWeight: 300 }, children: "\u2013 \u2013" })) }), _jsx("td", { className: "price", children: stock.eps ? formatNumber(stock.eps) : 'N/A' }), _jsx("td", { children: !stock ? (
                // Stock data not loaded yet
                _jsx("span", { style: { fontWeight: 300, color: '#999' }, children: "..." })) : (stock === null || stock === void 0 ? void 0 : stock.dividendYield) === undefined ? (
                // Dividend data loading
                _jsx("span", { style: { fontWeight: 300, color: '#666' }, children: "..." })) : (stock === null || stock === void 0 ? void 0 : stock.dividendYield) === null || (stock === null || stock === void 0 ? void 0 : stock.dividendYield) === 0 ? (
                // No dividend
                _jsx("span", { style: { fontWeight: 300 }, children: "\u2013 \u2013" })) : (
                // Dividend data loaded
                _jsx("span", { style: { fontWeight: 600 }, children: formatDividendYield(stock === null || stock === void 0 ? void 0 : stock.dividendYield, stock === null || stock === void 0 ? void 0 : stock.yieldBasis) })) }), _jsx("td", { className: "name", children: stock.name })] }));
    // Render modals using React Portal to avoid HTML nesting issues
    return tableRow;
}, (prevProps, nextProps) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23;
    // Custom comparison for memo - only re-render if important data changes
    return (prevProps.symbol === nextProps.symbol &&
        ((_a = prevProps.stock) === null || _a === void 0 ? void 0 : _a.price) === ((_b = nextProps.stock) === null || _b === void 0 ? void 0 : _b.price) &&
        ((_c = prevProps.stock) === null || _c === void 0 ? void 0 : _c.change) === ((_d = nextProps.stock) === null || _d === void 0 ? void 0 : _d.change) &&
        ((_e = prevProps.stock) === null || _e === void 0 ? void 0 : _e.changePercent) === ((_f = nextProps.stock) === null || _f === void 0 ? void 0 : _f.changePercent) &&
        ((_g = prevProps.stock) === null || _g === void 0 ? void 0 : _g.volume) === ((_h = nextProps.stock) === null || _h === void 0 ? void 0 : _h.volume) &&
        ((_j = prevProps.stock) === null || _j === void 0 ? void 0 : _j.lastUpdated) === ((_k = nextProps.stock) === null || _k === void 0 ? void 0 : _k.lastUpdated) &&
        ((_l = prevProps.stock) === null || _l === void 0 ? void 0 : _l.exDividendDate) === ((_m = nextProps.stock) === null || _m === void 0 ? void 0 : _m.exDividendDate) &&
        ((_o = prevProps.stock) === null || _o === void 0 ? void 0 : _o.dividendYield) === ((_p = nextProps.stock) === null || _p === void 0 ? void 0 : _p.dividendYield) &&
        ((_r = (_q = prevProps.stock) === null || _q === void 0 ? void 0 : _q.news) === null || _r === void 0 ? void 0 : _r.id) === ((_t = (_s = nextProps.stock) === null || _s === void 0 ? void 0 : _s.news) === null || _t === void 0 ? void 0 : _t.id) &&
        ((_u = prevProps.stock) === null || _u === void 0 ? void 0 : _u.newsCount) === ((_v = nextProps.stock) === null || _v === void 0 ? void 0 : _v.newsCount) &&
        ((_x = (_w = prevProps.stock) === null || _w === void 0 ? void 0 : _w.extendedHoursQuote) === null || _x === void 0 ? void 0 : _x.price) === ((_z = (_y = nextProps.stock) === null || _y === void 0 ? void 0 : _y.extendedHoursQuote) === null || _z === void 0 ? void 0 : _z.price) &&
        ((_1 = (_0 = prevProps.stock) === null || _0 === void 0 ? void 0 : _0.extendedHoursQuote) === null || _1 === void 0 ? void 0 : _1.change) === ((_3 = (_2 = nextProps.stock) === null || _2 === void 0 ? void 0 : _2.extendedHoursQuote) === null || _3 === void 0 ? void 0 : _3.change) &&
        ((_5 = (_4 = prevProps.stock) === null || _4 === void 0 ? void 0 : _4.extendedHoursQuote) === null || _5 === void 0 ? void 0 : _5.changePercent) === ((_7 = (_6 = nextProps.stock) === null || _6 === void 0 ? void 0 : _6.extendedHoursQuote) === null || _7 === void 0 ? void 0 : _7.changePercent) &&
        ((_8 = prevProps.newsMeta) === null || _8 === void 0 ? void 0 : _8.hasNews) === ((_9 = nextProps.newsMeta) === null || _9 === void 0 ? void 0 : _9.hasNews) &&
        ((_10 = prevProps.newsMeta) === null || _10 === void 0 ? void 0 : _10.count) === ((_11 = nextProps.newsMeta) === null || _11 === void 0 ? void 0 : _11.count) &&
        ((_12 = prevProps.rssNewsMeta) === null || _12 === void 0 ? void 0 : _12.count) === ((_13 = nextProps.rssNewsMeta) === null || _13 === void 0 ? void 0 : _13.count) &&
        ((_14 = prevProps.rssNewsMeta) === null || _14 === void 0 ? void 0 : _14.symbol) === ((_15 = nextProps.rssNewsMeta) === null || _15 === void 0 ? void 0 : _15.symbol) &&
        ((_16 = prevProps.analystMeta) === null || _16 === void 0 ? void 0 : _16.hasAnalystData) === ((_17 = nextProps.analystMeta) === null || _17 === void 0 ? void 0 : _17.hasAnalystData) &&
        ((_18 = prevProps.analystMeta) === null || _18 === void 0 ? void 0 : _18.upgrades) === ((_19 = nextProps.analystMeta) === null || _19 === void 0 ? void 0 : _19.upgrades) &&
        ((_20 = prevProps.analystMeta) === null || _20 === void 0 ? void 0 : _20.downgrades) === ((_21 = nextProps.analystMeta) === null || _21 === void 0 ? void 0 : _21.downgrades) &&
        ((_22 = prevProps.analystMeta) === null || _22 === void 0 ? void 0 : _22.initiations) === ((_23 = nextProps.analystMeta) === null || _23 === void 0 ? void 0 : _23.initiations) &&
        prevProps.isHighlighted === nextProps.isHighlighted &&
        prevProps.deleteMode === nextProps.deleteMode &&
        prevProps.reorderMode === nextProps.reorderMode &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isDropTarget === nextProps.isDropTarget &&
        prevProps.dropPosition === nextProps.dropPosition &&
        prevProps.showExtendedHours === nextProps.showExtendedHours);
});
export default StockRow;
