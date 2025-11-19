'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
export default function ActionsDropdown({ onDeleteMode, onReorderMode, onAddHeader, isTabReorderMode, deleteMode, reorderMode }) {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showDropdown]);
    // Component is now always visible in all modes
    return (_jsxs("div", { ref: dropdownRef, style: { position: 'relative' }, children: [_jsxs("button", { onClick: () => setShowDropdown(!showDropdown), style: {
                    background: 'rgb(var(--watchlist-button-bg))',
                    border: '2px solid rgb(var(--watchlist-button-border))',
                    color: 'rgb(var(--watchlist-text-primary))',
                    padding: '6px 12px',
                    height: '32px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }, onMouseEnter: (e) => {
                    e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))';
                }, onMouseLeave: (e) => {
                    e.currentTarget.style.background = 'rgb(var(--watchlist-button-bg))';
                }, children: ["Actions", _jsx("svg", { width: "10", height: "10", viewBox: "0 0 10 10", fill: "currentColor", children: _jsx("path", { d: "M5 8L1 2h8z" }) })] }), showDropdown && (_jsxs("div", { style: {
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: 'rgb(var(--watchlist-surface))',
                    border: '1px solid rgb(var(--watchlist-border))',
                    borderRadius: '8px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    minWidth: '200px',
                    zIndex: 1000,
                    overflow: 'hidden'
                }, children: [_jsx("div", { style: { position: 'relative' }, children: _jsxs("button", { onClick: () => {
                                setShowDropdown(false);
                                onDeleteMode();
                            }, disabled: isTabReorderMode || deleteMode || reorderMode, style: {
                                width: '100%',
                                padding: '10px 16px',
                                background: 'transparent',
                                border: 'none',
                                cursor: (isTabReorderMode || deleteMode || reorderMode) ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                textAlign: 'left',
                                color: (isTabReorderMode || deleteMode || reorderMode) ? 'rgb(var(--watchlist-text-muted))' : 'rgb(var(--watchlist-text-primary))',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                transition: 'background 0.2s',
                                opacity: (isTabReorderMode || deleteMode || reorderMode) ? 0.5 : 1
                            }, onMouseEnter: (e) => {
                                if (!isTabReorderMode && !deleteMode && !reorderMode) {
                                    e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))';
                                }
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.background = 'transparent';
                            }, title: (!deleteMode && reorderMode) ? 'Click "Done" first to exit current mode' : '', children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }) }), "Delete"] }) }), _jsx("div", { style: { position: 'relative' }, children: _jsxs("button", { onClick: () => {
                                setShowDropdown(false);
                                onReorderMode();
                            }, disabled: isTabReorderMode || deleteMode || reorderMode, style: {
                                width: '100%',
                                padding: '10px 16px',
                                background: 'transparent',
                                border: 'none',
                                cursor: (isTabReorderMode || deleteMode || reorderMode) ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                textAlign: 'left',
                                color: (isTabReorderMode || deleteMode || reorderMode) ? 'rgb(var(--watchlist-text-muted))' : 'rgb(var(--watchlist-text-primary))',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                transition: 'background 0.2s',
                                opacity: (isTabReorderMode || deleteMode || reorderMode) ? 0.5 : 1
                            }, onMouseEnter: (e) => {
                                if (!isTabReorderMode && !deleteMode && !reorderMode) {
                                    e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))';
                                }
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.background = 'transparent';
                            }, title: (deleteMode && !reorderMode) ? 'Click "Done" first to exit current mode' : '', children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "5.01" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "12.01" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "19.01" }), _jsx("line", { x1: "7", y1: "5", x2: "7", y2: "5.01" }), _jsx("line", { x1: "7", y1: "12", x2: "7", y2: "12.01" }), _jsx("line", { x1: "7", y1: "19", x2: "7", y2: "19.01" }), _jsx("line", { x1: "17", y1: "5", x2: "17", y2: "5.01" }), _jsx("line", { x1: "17", y1: "12", x2: "17", y2: "12.01" }), _jsx("line", { x1: "17", y1: "19", x2: "17", y2: "19.01" })] }), "Reorder"] }) }), _jsxs("button", { onClick: () => {
                            setShowDropdown(false);
                            onAddHeader();
                        }, disabled: isTabReorderMode, style: {
                            width: '100%',
                            padding: '10px 16px',
                            background: 'transparent',
                            border: 'none',
                            cursor: isTabReorderMode ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            textAlign: 'left',
                            color: isTabReorderMode ? 'rgb(var(--watchlist-text-muted))' : 'rgb(var(--watchlist-text-primary))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'background 0.2s',
                            opacity: isTabReorderMode ? 0.5 : 1
                        }, onMouseEnter: (e) => {
                            if (!isTabReorderMode) {
                                e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))';
                            }
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.background = 'transparent';
                        }, children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }), _jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("line", { x1: "3", y1: "18", x2: "21", y2: "18" })] }), "Add Header"] })] }))] }));
}
