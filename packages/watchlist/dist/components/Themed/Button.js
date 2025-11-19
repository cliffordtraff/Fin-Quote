'use client';
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
import { forwardRef } from 'react';
import { cn } from '@watchlist/lib/utils';
const ThemedButton = forwardRef((_a, ref) => {
    var { variant = 'default', size = 'md', className, children } = _a, props = __rest(_a, ["variant", "size", "className", "children"]);
    const baseStyles = `
      inline-flex items-center justify-center
      font-medium rounded-md
      transition-colors duration-200 motion-safe:transition-colors
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watchlist-focus-ring focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
    `;
    const variants = {
        default: `
        bg-watchlist-button-bg hover:bg-watchlist-button-hover
        border-2 border-watchlist-button-border
        text-watchlist-text-primary
      `,
        danger: `
        bg-red-600 hover:bg-red-700
        border-2 border-red-700
        text-white
      `,
        success: `
        bg-green-600 hover:bg-green-700
        border-2 border-green-700
        text-white
      `,
    };
    const sizes = {
        sm: 'px-2.5 py-1.5 text-sm h-7',
        md: 'px-3 py-1.5 text-base h-8',
        lg: 'px-4 py-2 text-lg h-10',
    };
    return (_jsx("button", Object.assign({ ref: ref, className: cn(baseStyles, variants[variant], sizes[size], className) }, props, { children: children })));
});
ThemedButton.displayName = 'ThemedButton';
export default ThemedButton;
