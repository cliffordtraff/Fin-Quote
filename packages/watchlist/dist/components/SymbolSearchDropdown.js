'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useSymbolSearch } from '@watchlist/hooks/useSymbolSearch';
export const SymbolSearchDropdown = forwardRef(({ onSelect, existingSymbols = [], existingTvSymbols = [], placeholder = "Search symbols..." }, ref) => {
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [showLoadingDelayed, setShowLoadingDelayed] = useState(false);
    const [showNoResultsDelayed, setShowNoResultsDelayed] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const loadingTimerRef = useRef(null);
    const noResultsTimerRef = useRef(null);
    // Expose the input ref to parent components
    useImperativeHandle(ref, () => inputRef.current, []);
    const { searchResults, isSearching, searchError, searchSymbols, clearResults, hasExtension } = useSymbolSearch();
    // Handle input change
    const handleInputChange = (e) => {
        const value = e.target.value;
        setInputValue(value);
        setSelectedIndex(-1);
        if (value.trim()) {
            setIsOpen(true);
            searchSymbols(value);
        }
        else {
            setIsOpen(false);
            clearResults();
        }
    };
    // Handle loading indicator with delay to prevent flicker
    useEffect(() => {
        if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current);
            loadingTimerRef.current = null;
        }
        if (isSearching) {
            loadingTimerRef.current = setTimeout(() => {
                setShowLoadingDelayed(true);
            }, 100);
        }
        else {
            setShowLoadingDelayed(false);
        }
        return () => {
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current);
            }
        };
    }, [isSearching]);
    // Handle "no results" message with delay
    useEffect(() => {
        if (noResultsTimerRef.current) {
            clearTimeout(noResultsTimerRef.current);
            noResultsTimerRef.current = null;
        }
        // Show "no results" only after search is complete and there are truly no results
        if (!isSearching && searchResults.length === 0 && inputValue.trim() && isOpen) {
            noResultsTimerRef.current = setTimeout(() => {
                setShowNoResultsDelayed(true);
            }, 500); // Wait 500ms before showing "no results"
        }
        else {
            setShowNoResultsDelayed(false);
        }
        return () => {
            if (noResultsTimerRef.current) {
                clearTimeout(noResultsTimerRef.current);
            }
        };
    }, [isSearching, searchResults.length, inputValue, isOpen]);
    // Handle selection
    const handleSelect = useCallback((result) => {
        var _a;
        // Store user preference
        localStorage.setItem('preferredExchange', result.exchange);
        if (result.isADR) {
            localStorage.setItem('preferredMarket', 'US');
        }
        onSelect(result);
        setInputValue('');
        setIsOpen(false);
        clearResults();
        (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
    }, [onSelect, clearResults]);
    // Keyboard navigation
    const handleKeyDown = (e) => {
        if (!isOpen || searchResults.length === 0) {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => prev < searchResults.length - 1 ? prev + 1 : prev);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > -1 ? prev - 1 : prev);
                break;
            case 'Enter':
            case 'Tab':
                if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
                    e.preventDefault();
                    handleSelect(searchResults[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
            case 'Home':
                e.preventDefault();
                setSelectedIndex(0);
                break;
            case 'End':
                e.preventDefault();
                setSelectedIndex(searchResults.length - 1);
                break;
        }
    };
    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    // Format display as table row
    const formatResult = (result) => {
        // Determine the type to display
        let typeDisplay = 'Stock';
        if (result.type === 'etf') {
            typeDisplay = 'ETF';
        }
        else if (result.isADR) {
            typeDisplay = 'ADR';
        }
        else if (result.country && result.country !== 'US') {
            typeDisplay = result.country.toUpperCase();
        }
        // Check if this exact exchange version exists
        const symbolsToCheck = existingTvSymbols.length > 0 ? existingTvSymbols : existingSymbols;
        const isExisting = symbolsToCheck.includes(result.tvSymbol);
        return (_jsxs("div", { style: {
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '0 12px',
                gap: '12px'
            }, children: [_jsxs("div", { style: {
                        width: '15%',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }, children: [result.symbol, isExisting && (_jsx("span", { style: { color: '#4caf50', fontSize: '15px' }, children: "\u2713" }))] }), _jsx("div", { style: {
                        width: '50%',
                        fontSize: '15px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }, children: result.name }), _jsx("div", { style: {
                        width: '15%',
                        fontSize: '14px',
                        color: 'rgb(var(--watchlist-text-secondary))'
                    }, children: typeDisplay }), _jsx("div", { style: {
                        width: '20%',
                        fontSize: '14px',
                        color: 'rgb(var(--watchlist-text-secondary))',
                        textAlign: 'right'
                    }, children: result.exchange })] }));
    };
    return (_jsxs("div", { ref: dropdownRef, style: { position: 'relative' }, children: [_jsx("div", { style: { position: 'relative' }, children: _jsx("input", { ref: inputRef, type: "text", value: inputValue, onChange: handleInputChange, onKeyDown: handleKeyDown, onFocus: () => inputValue && setIsOpen(true), placeholder: placeholder, style: {
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid rgb(var(--watchlist-border))',
                        borderRadius: '4px',
                        fontSize: '14px',
                        outline: 'none',
                        backgroundColor: 'rgb(var(--watchlist-surface))',
                        color: 'rgb(var(--watchlist-text-primary))'
                    } }) }), isOpen && (_jsxs("div", { style: {
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    width: '650px',
                    maxWidth: 'calc(100vw - 40px)', // Responsive: prevents overflow on narrow screens
                    minWidth: '100%',
                    marginTop: '4px',
                    background: 'rgb(var(--watchlist-surface))',
                    border: '1px solid rgb(var(--watchlist-border))',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    zIndex: 1000,
                    color: 'rgb(var(--watchlist-text-primary))'
                }, children: [showLoadingDelayed && (_jsx("div", { style: { padding: '12px', color: 'rgb(var(--watchlist-text-secondary))', fontSize: '14px' }, children: "Searching..." })), !isSearching && searchError && (_jsxs("div", { style: { padding: '12px', color: '#d32f2f', fontSize: '14px' }, children: ["Error: ", searchError] })), showNoResultsDelayed && !searchError && (_jsxs("div", { style: { padding: '12px', color: 'rgb(var(--watchlist-text-secondary))', fontSize: '14px' }, children: ["No symbols found for \"", inputValue, "\""] })), !isSearching && searchResults.length > 0 && (_jsx("div", { children: searchResults.map((result, index) => (_jsx("div", { onClick: () => handleSelect(result), onMouseEnter: () => setSelectedIndex(index), style: {
                                padding: '10px 0',
                                cursor: 'pointer',
                                background: selectedIndex === index ? 'rgb(var(--watchlist-button-hover))' : 'rgb(var(--watchlist-surface))',
                                borderBottom: index < searchResults.length - 1 ? '1px solid rgb(var(--watchlist-border))' : 'none',
                                fontSize: '14px',
                                transition: 'background-color 0.1s'
                            }, children: formatResult(result) }, `${result.tvSymbol}-${index}`))) }))] }))] }));
});
