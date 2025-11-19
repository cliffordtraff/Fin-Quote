'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
export default function ThemedModal({ isOpen, onClose, title, children }) {
    useEffect(() => {
        if (isOpen) {
            const handleEscape = (e) => {
                if (e.key === 'Escape')
                    onClose();
            };
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    return createPortal(_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 bg-black/50 dark:bg-black/70 z-[9999] transition-opacity", onClick: onClose, "aria-hidden": "true" }), _jsx("div", { className: "fixed inset-0 z-[10000] flex items-center justify-center p-4", role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title", children: _jsxs("div", { className: "\n            bg-watchlist-surface rounded-lg shadow-xl\n            border border-watchlist-border\n            min-w-[350px] max-w-lg w-full\n            p-6\n          ", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { id: "modal-title", className: "text-lg font-semibold text-watchlist-text-primary mb-4", children: title }), children] }) })] }), document.body);
}
