import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cn } from '@watchlist/lib/utils';
export default function Modal({ isOpen, onClose, title, children, className }) {
    if (!isOpen)
        return null;
    return (_jsx(_Fragment, { children: _jsx("div", { className: "fixed inset-0 bg-black/50 z-[1999] flex items-center justify-center", onClick: onClose, children: _jsxs("div", { className: cn('bg-watchlist-surface rounded-lg p-6 min-w-[300px] shadow-xl', className), onClick: (e) => e.stopPropagation(), children: [title && (_jsx("h3", { className: "text-lg font-semibold text-watchlist-text-primary mb-4", children: title })), children] }) }) }));
}
