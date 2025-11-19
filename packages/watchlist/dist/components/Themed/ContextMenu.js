'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function ContextMenu({ isOpen, x, y, onClose, children }) {
    const menuRef = useRef(null);
    useEffect(() => {
        if (isOpen) {
            const handleClickOutside = (e) => {
                if (menuRef.current && !menuRef.current.contains(e.target)) {
                    onClose();
                }
            };
            // Small delay to prevent immediate close from the click that opened it
            setTimeout(() => {
                document.addEventListener('click', handleClickOutside);
            }, 0);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    return createPortal(_jsx("div", { ref: menuRef, className: "\n        fixed z-[10000]\n        bg-watchlist-surface rounded-md shadow-xl\n        border border-watchlist-border\n        min-w-[140px] py-1\n      ", style: { top: y, left: x }, role: "menu", children: children }), document.body);
}
export function ContextMenuItem({ onClick, disabled, danger, children }) {
    return (_jsx("button", { className: `
        w-full px-3 py-2 text-left text-sm
        transition-colors duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${danger
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            : 'text-watchlist-text-primary hover:bg-watchlist-surface-elevated'}
      `, onClick: onClick, disabled: disabled, role: "menuitem", children: children }));
}
