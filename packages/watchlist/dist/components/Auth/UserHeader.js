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
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@watchlist/components/ThemeToggle';
export default function UserHeader({ onIncreaseText, onDecreaseText, canIncreaseText = true, canDecreaseText = true }) {
    var _a;
    const { user, logout } = useAuth();
    const router = useRouter();
    const [showDropdown, setShowDropdown] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);
    const handleLogout = () => __awaiter(this, void 0, void 0, function* () {
        setLoggingOut(true);
        try {
            yield logout();
            router.push('/auth');
        }
        catch (error) {
            console.error('Logout error:', error);
            setLoggingOut(false);
        }
    });
    // Compute user-specific values (safe to call even when user is null)
    const displayName = user ? (user.displayName || ((_a = user.email) === null || _a === void 0 ? void 0 : _a.split('@')[0]) || 'User') : 'Guest';
    const initials = displayName
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    const showTextControls = Boolean(onIncreaseText || onDecreaseText);
    const decreaseDisabled = !onDecreaseText || !canDecreaseText;
    const increaseDisabled = !onIncreaseText || !canIncreaseText;
    const NAV_SHORTCUTS = [
        { label: 'Chatbot', href: '/' },
        { label: 'Market', href: '/market' },
        { label: 'Financials', href: '/stock/aapl' }
    ];
    const goBackToMainApp = () => {
        router.push('/');
    };
    const BackToAppButton = () => (_jsxs("button", { type: "button", onClick: goBackToMainApp, "aria-label": "Return to Fin Quote navigation", title: "Back to Fin Quote", style: {
            height: '36px',
            padding: '0 0.85rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
        }, onMouseEnter: (e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }, onMouseLeave: (e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
        }, children: [_jsx("span", { style: { fontSize: '1rem', lineHeight: 1 }, children: "\u2190" }), "Back to tabs"] }));
    const NavShortcuts = () => (_jsx("div", { style: { display: 'flex', gap: '0.35rem' }, children: NAV_SHORTCUTS.map((link) => (_jsx("button", { type: "button", onClick: () => router.push(link.href), style: {
                height: '32px',
                padding: '0 0.6rem',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '5px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center'
            }, onMouseEnter: (e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
            }, onMouseLeave: (e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }, children: link.label }, link.href))) }));
    // Render sign in button for unauthenticated users
    if (!user) {
        return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' }, children: [showTextControls && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' }, children: [_jsx("button", { type: "button", onClick: onDecreaseText, disabled: decreaseDisabled, "aria-label": "Decrease text size", title: "Decrease text size", style: {
                                width: '36px',
                                height: '36px',
                                padding: '0.5rem',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '6px',
                                color: 'white',
                                cursor: decreaseDisabled ? 'not-allowed' : 'pointer',
                                fontSize: '1.125rem',
                                fontWeight: '600',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: decreaseDisabled ? 0.5 : 1
                            }, onMouseEnter: (e) => {
                                if (!decreaseDisabled) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                }
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            }, children: "-" }), _jsx("button", { type: "button", onClick: onIncreaseText, disabled: increaseDisabled, "aria-label": "Increase text size", title: "Increase text size", style: {
                                width: '36px',
                                height: '36px',
                                padding: '0.5rem',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '6px',
                                color: 'white',
                                cursor: increaseDisabled ? 'not-allowed' : 'pointer',
                                fontSize: '1.125rem',
                                fontWeight: '600',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: increaseDisabled ? 0.5 : 1
                            }, onMouseEnter: (e) => {
                                if (!increaseDisabled) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                }
                            }, onMouseLeave: (e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            }, children: "+" })] })), isMounted && _jsx(ThemeToggle, {}), _jsx(NavShortcuts, {}), _jsx(BackToAppButton, {}), _jsxs("button", { onClick: () => router.push('/news'), style: {
                        height: '36px',
                        padding: '0 0.8rem',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }, children: [_jsx("span", { style: { fontSize: '1rem' }, children: "\uD83D\uDCF0" }), "News"] }), _jsx("button", { onClick: () => router.push('/auth'), style: {
                        height: '36px',
                        padding: '0 1rem',
                        background: '#2962ff',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.2s'
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.background = '#1e4fd6';
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.background = '#2962ff';
                    }, children: "Sign In" })] }));
    }
    // Render user dropdown for authenticated users
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' }, children: [showTextControls && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' }, children: [_jsx("button", { type: "button", onClick: onDecreaseText, disabled: decreaseDisabled, "aria-label": "Decrease text size", title: "Decrease text size", style: {
                            width: '36px',
                            height: '36px',
                            padding: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '6px',
                            color: 'white',
                            cursor: decreaseDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: decreaseDisabled ? 0.5 : 1
                        }, onMouseEnter: (e) => {
                            if (!decreaseDisabled) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                            }
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }, children: "-" }), _jsx("button", { type: "button", onClick: onIncreaseText, disabled: increaseDisabled, "aria-label": "Increase text size", title: "Increase text size", style: {
                            width: '36px',
                            height: '36px',
                            padding: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '6px',
                            color: 'white',
                            cursor: increaseDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: increaseDisabled ? 0.5 : 1
                        }, onMouseEnter: (e) => {
                            if (!increaseDisabled) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                            }
                        }, onMouseLeave: (e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }, children: "+" })] })), _jsx(NavShortcuts, {}), _jsx(BackToAppButton, {}), isMounted && _jsx(ThemeToggle, {}), _jsxs("button", { onClick: () => router.push('/news'), style: {
                    height: '36px',
                    padding: '0 0.8rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }, onMouseEnter: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }, onMouseLeave: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }, children: [_jsx("span", { style: { fontSize: '1rem' }, children: "\uD83D\uDCF0" }), "News"] }), _jsxs("div", { style: { position: 'relative' }, children: [_jsxs("button", { onClick: () => setShowDropdown(!showDropdown), style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            color: 'white'
                        }, children: [_jsx("div", { style: {
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: '#2962ff',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold'
                                }, children: initials }), _jsx("span", { style: { maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }, children: displayName }), _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "white", strokeWidth: "2", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) })] }), showDropdown && (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    zIndex: 999
                                }, onClick: () => setShowDropdown(false) }), _jsxs("div", { style: {
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.5rem',
                                    background: 'rgb(var(--watchlist-surface))',
                                    border: '1px solid rgb(var(--watchlist-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                    minWidth: '200px',
                                    zIndex: 1000
                                }, children: [_jsxs("div", { style: {
                                            padding: '1rem',
                                            borderBottom: '1px solid rgb(var(--watchlist-border))'
                                        }, children: [_jsx("div", { style: { fontWeight: 'bold', marginBottom: '0.25rem', color: 'rgb(var(--watchlist-text-primary))' }, children: displayName }), _jsx("div", { style: { fontSize: '0.85rem', color: 'rgb(var(--watchlist-text-secondary))' }, children: user.email })] }), _jsx("button", { onClick: handleLogout, disabled: loggingOut, style: {
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            background: 'transparent',
                                            border: 'none',
                                            borderRadius: '0 0 8px 8px',
                                            cursor: loggingOut ? 'not-allowed' : 'pointer',
                                            fontSize: '0.9rem',
                                            textAlign: 'left',
                                            color: loggingOut ? 'rgb(var(--watchlist-text-muted))' : 'rgb(var(--watchlist-text-primary))',
                                            transition: 'background 0.2s'
                                        }, onMouseEnter: (e) => {
                                            if (!loggingOut) {
                                                e.currentTarget.style.background = 'rgb(var(--watchlist-button-hover))';
                                            }
                                        }, onMouseLeave: (e) => {
                                            e.currentTarget.style.background = 'transparent';
                                        }, children: loggingOut ? 'Logging out...' : 'Log out' })] })] }))] })] }));
}
