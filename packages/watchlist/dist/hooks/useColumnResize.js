import { useEffect, useState, useCallback, useRef } from 'react';
// Default column widths (in pixels)
const DEFAULT_WIDTHS = {
    symbol: 80,
    news: 60,
    lastTrade: 100,
    change: 80,
    changePercent: 70,
    bid: 80,
    ask: 80,
    bidSize: 80,
    askSize: 80,
    volume: 100,
    low: 80,
    high: 80,
    marketCap: 100,
    peRatio: 80,
    exDate: 90,
    eps: 80,
    divYield: 80,
    name: 250,
    actions: 50,
    checkbox: 50
};
// Minimum column widths
const MIN_WIDTHS = {
    symbol: 50,
    news: 40,
    lastTrade: 60,
    change: 60,
    changePercent: 50,
    bid: 60,
    ask: 60,
    bidSize: 60,
    askSize: 60,
    volume: 70,
    low: 60,
    high: 60,
    marketCap: 80,
    peRatio: 60,
    exDate: 70,
    eps: 60,
    divYield: 60,
    name: 100,
    actions: 40,
    checkbox: 50
};
// Maximum column widths (for autofit)
const MAX_WIDTHS = {
    symbol: 150,
    news: 80,
    lastTrade: 120,
    change: 120,
    changePercent: 100,
    bid: 120,
    ask: 120,
    bidSize: 120,
    askSize: 120,
    volume: 150,
    low: 120,
    high: 120,
    marketCap: 150,
    peRatio: 120,
    exDate: 120,
    eps: 120,
    divYield: 120,
    name: 2000, // Description can be very long - allow up to 2000px
    actions: 100,
    checkbox: 80
};
const STORAGE_KEY = 'watchlist_column_widths';
const PERSIST_DEBOUNCE_MS = 500;
const mergeWithDefaults = (widths) => (Object.assign(Object.assign({}, DEFAULT_WIDTHS), (widths !== null && widths !== void 0 ? widths : {})));
const areColumnWidthsEqual = (a, b) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
};
export function useColumnResize(tableRef, options = {}) {
    const { persistedWidths, onWidthsPersist, disableLocalStorage = false, persistDebounceMs = PERSIST_DEBOUNCE_MS } = options;
    const shouldUseLocalStorage = !disableLocalStorage && !onWidthsPersist && persistedWidths === undefined;
    const [columnWidths, setColumnWidths] = useState(() => mergeWithDefaults(persistedWidths));
    const [resizeState, setResizeState] = useState({
        isResizing: false,
        columnIndex: null,
        columnKey: null,
        startX: 0,
        startWidth: 0,
        currentX: 0,
        edge: 'right'
    });
    const resizePreviewRef = useRef(null);
    const activeHandleRef = useRef(null);
    const persistTimeoutRef = useRef(null);
    // Load saved widths from localStorage only when remote persistence isn't available
    useEffect(() => {
        if (!shouldUseLocalStorage)
            return;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    setColumnWidths(mergeWithDefaults(parsed));
                }
            }
        }
        catch (e) {
            console.error('Failed to parse saved column widths:', e);
        }
    }, [shouldUseLocalStorage]);
    // Sync with persisted widths from remote storage
    useEffect(() => {
        if (persistedWidths === undefined)
            return;
        const merged = mergeWithDefaults(persistedWidths);
        setColumnWidths(prev => (areColumnWidthsEqual(prev, merged) ? prev : merged));
    }, [persistedWidths]);
    const schedulePersist = useCallback((nextWidths) => {
        if (persistTimeoutRef.current) {
            clearTimeout(persistTimeoutRef.current);
        }
        persistTimeoutRef.current = window.setTimeout(() => {
            if (onWidthsPersist) {
                onWidthsPersist(nextWidths);
            }
            else if (shouldUseLocalStorage) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextWidths));
                }
                catch (error) {
                    console.error('Failed to save column widths:', error);
                }
            }
        }, persistDebounceMs);
    }, [onWidthsPersist, shouldUseLocalStorage, persistDebounceMs]);
    // Create resize preview line
    const createPreviewLine = useCallback(() => {
        if (!resizePreviewRef.current) {
            const preview = document.createElement('div');
            preview.style.cssText = `
        position: fixed;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #2962ff;
        z-index: 9999;
        pointer-events: none;
        display: none;
        box-shadow: 0 0 3px rgba(41, 98, 255, 0.5);
      `;
            document.body.appendChild(preview);
            resizePreviewRef.current = preview;
        }
        return resizePreviewRef.current;
    }, []);
    // Start resizing
    const handleResizeStart = useCallback((e, columnKey, columnIndex, edge = 'right') => {
        e.preventDefault();
        e.stopPropagation();
        const handle = e.currentTarget;
        activeHandleRef.current = handle;
        // Use pointer capture for reliable tracking
        handle.setPointerCapture(e.nativeEvent.pointerId);
        // Get current column width
        const currentWidth = columnWidths[columnKey] || DEFAULT_WIDTHS[columnKey];
        // Show preview line
        const preview = createPreviewLine();
        preview.style.display = 'block';
        preview.style.left = `${e.clientX}px`;
        setResizeState({
            isResizing: true,
            columnIndex,
            columnKey,
            startX: e.clientX,
            startWidth: currentWidth,
            currentX: e.clientX,
            edge
        });
        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    }, [columnWidths, createPreviewLine]);
    // Handle resize move
    const handleResizeMove = useCallback((e) => {
        if (!resizeState.isResizing || resizeState.columnIndex === null)
            return;
        // Update preview line position
        if (resizePreviewRef.current) {
            resizePreviewRef.current.style.left = `${e.clientX}px`;
        }
        setResizeState(prev => (Object.assign(Object.assign({}, prev), { currentX: e.clientX })));
    }, [resizeState.isResizing, resizeState.columnIndex]);
    // End resizing
    const handleResizeEnd = useCallback((e) => {
        if (!resizeState.isResizing || resizeState.columnIndex === null)
            return;
        // Release pointer capture
        if (activeHandleRef.current) {
            activeHandleRef.current.releasePointerCapture(e.pointerId);
            activeHandleRef.current = null;
        }
        // Hide preview line
        if (resizePreviewRef.current) {
            resizePreviewRef.current.style.display = 'none';
        }
        // Calculate new width
        let delta = resizeState.currentX - resizeState.startX;
        // If resizing from the left edge, moving right should decrease width
        if (resizeState.edge === 'left') {
            delta = -delta;
        }
        // Get the stored column key
        const columnKey = resizeState.columnKey;
        if (columnKey) {
            const minWidth = MIN_WIDTHS[columnKey] || 50;
            const newWidth = Math.max(resizeState.startWidth + delta, minWidth);
            setColumnWidths(prev => {
                const updated = Object.assign(Object.assign({}, prev), { [columnKey]: newWidth });
                schedulePersist(updated);
                return updated;
            });
        }
        // Reset state
        setResizeState({
            isResizing: false,
            columnIndex: null,
            columnKey: null,
            startX: 0,
            startWidth: 0,
            currentX: 0
        });
        // Restore cursor
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }, [resizeState, schedulePersist]);
    // Handle double-click to auto-fit
    const handleDoubleClick = useCallback((columnKey) => {
        var _a;
        if (!tableRef.current)
            return;
        // Find the actual column index in the table by looking at header cells
        const headerCells = tableRef.current.querySelectorAll('thead th');
        let columnIndex = -1;
        headerCells.forEach((th, index) => {
            // Check if this header corresponds to our column key
            // Match by class name (e.g., 'symbol', 'news') or by checking context
            const classList = Array.from(th.classList);
            if (classList.includes(columnKey)) {
                columnIndex = index;
            }
        });
        // Fallback: try to find by position in DEFAULT_WIDTHS, accounting for potential control column
        if (columnIndex === -1) {
            const baseIndex = Object.keys(DEFAULT_WIDTHS).indexOf(columnKey);
            if (baseIndex !== -1) {
                // Check if there's a control column (will be the first column)
                const firstHeader = headerCells[0];
                const hasControlColumn = firstHeader && (firstHeader.querySelector('input[type="checkbox"]') !== null ||
                    ((_a = firstHeader.textContent) === null || _a === void 0 ? void 0 : _a.trim()) === '');
                columnIndex = hasControlColumn ? baseIndex + 1 : baseIndex;
            }
        }
        if (columnIndex === -1)
            return;
        const cells = tableRef.current.querySelectorAll(`td:nth-child(${columnIndex + 1}), th:nth-child(${columnIndex + 1})`);
        let maxWidth = MIN_WIDTHS[columnKey] || 50;
        // Get padding from first cell (to match actual cell padding)
        let cellPadding = 16; // Default padding (8px * 2 for left + right)
        if (cells.length > 0) {
            const firstCell = cells[0];
            const styles = window.getComputedStyle(firstCell);
            const paddingLeft = parseFloat(styles.paddingLeft) || 8;
            const paddingRight = parseFloat(styles.paddingRight) || 8;
            cellPadding = paddingLeft + paddingRight;
        }
        // Create temporary element to measure text
        const measurer = document.createElement('span');
        measurer.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      pointer-events: none;
    `;
        document.body.appendChild(measurer);
        cells.forEach(cell => {
            // Get the text content, excluding nested elements like buttons/icons
            const textContent = cell.textContent || '';
            if (!textContent.trim())
                return; // Skip empty cells
            measurer.textContent = textContent;
            // Copy all font-related styles for accurate measurement
            const cellStyles = window.getComputedStyle(cell);
            measurer.style.font = cellStyles.font;
            measurer.style.fontSize = cellStyles.fontSize;
            measurer.style.fontFamily = cellStyles.fontFamily;
            measurer.style.fontWeight = cellStyles.fontWeight;
            measurer.style.letterSpacing = cellStyles.letterSpacing;
            // Measure the text width and add padding plus extra buffer for safety
            const width = measurer.getBoundingClientRect().width + cellPadding + 8; // +8px buffer
            maxWidth = Math.max(maxWidth, width);
        });
        document.body.removeChild(measurer);
        // Apply new width with column-specific max width
        const maxAllowed = MAX_WIDTHS[columnKey] || 400;
        // Round up to nearest pixel to avoid subpixel rendering issues
        const finalWidth = Math.ceil(Math.min(maxWidth, maxAllowed));
        setColumnWidths(prev => {
            const updated = Object.assign(Object.assign({}, prev), { [columnKey]: finalWidth });
            schedulePersist(updated);
            return updated;
        });
    }, [tableRef, schedulePersist]);
    // Set up global mouse event listeners
    useEffect(() => {
        if (resizeState.isResizing) {
            const handleMouseMove = (e) => handleResizeMove(e);
            const handleMouseUp = (e) => handleResizeEnd(e);
            document.addEventListener('pointermove', handleMouseMove);
            document.addEventListener('pointerup', handleMouseUp);
            return () => {
                document.removeEventListener('pointermove', handleMouseMove);
                document.removeEventListener('pointerup', handleMouseUp);
            };
        }
    }, [resizeState.isResizing, handleResizeMove, handleResizeEnd]);
    // Cleanup preview line on unmount
    useEffect(() => {
        return () => {
            if (resizePreviewRef.current && resizePreviewRef.current.parentNode) {
                resizePreviewRef.current.parentNode.removeChild(resizePreviewRef.current);
            }
        };
    }, []);
    // Reset widths to defaults
    const resetWidths = useCallback(() => {
        const defaults = mergeWithDefaults();
        setColumnWidths(defaults);
        schedulePersist(defaults);
        if (shouldUseLocalStorage) {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [schedulePersist, shouldUseLocalStorage]);
    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (persistTimeoutRef.current) {
                clearTimeout(persistTimeoutRef.current);
            }
        };
    }, []);
    return {
        columnWidths,
        handleResizeStart,
        handleDoubleClick,
        resetWidths,
        isResizing: resizeState.isResizing
    };
}
