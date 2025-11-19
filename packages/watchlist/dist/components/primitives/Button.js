var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import { cn } from '@watchlist/lib/utils';
const Button = React.forwardRef((_a, ref) => {
    var { className, variant = 'primary', size = 'md' } = _a, props = __rest(_a, ["className", "variant", "size"]);
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watchlist-focus-ring disabled:opacity-50 disabled:pointer-events-none';
    const variantStyles = {
        primary: 'bg-watchlist-button-bg hover:bg-watchlist-button-hover border border-watchlist-button-border text-watchlist-text-primary',
        secondary: 'bg-watchlist-button-bg hover:bg-watchlist-button-hover border border-watchlist-button-border text-watchlist-text-primary',
        success: 'bg-green-600 hover:bg-green-700 text-white border-none',
        danger: 'bg-red-600 hover:bg-red-700 text-white border-none'
    };
    const sizeStyles = {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg'
    };
    return (_jsx("button", Object.assign({ ref: ref, className: cn(baseStyles, variantStyles[variant], sizeStyles[size], className) }, props)));
});
Button.displayName = 'Button';
export default Button;
