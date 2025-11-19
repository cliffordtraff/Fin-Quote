import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from 'react';
import { cn } from '@watchlist/lib/utils';
export default function ContextMenu({ x, y, items, onClose }) {
    useEffect(() => {
        const handleClick = () => onClose();
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [onClose]);
    return (_jsx("div", { className: "fixed bg-watchlist-surface border border-watchlist-border rounded shadow-lg z-[1000] min-w-[120px]", style: { left: x, top: y }, onClick: (e) => e.stopPropagation(), children: items.map((item, index) => (_jsx("div", { className: cn('px-3 py-2 text-sm cursor-pointer transition-colors', index > 0 && 'border-t border-watchlist-border', item.disabled && 'opacity-50 cursor-not-allowed', item.variant === 'danger'
                ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-watchlist-text-primary hover:bg-watchlist-button-hover'), onClick: () => {
                if (!item.disabled) {
                    item.onClick();
                }
            }, title: item.title, children: item.label }, index))) }));
}
