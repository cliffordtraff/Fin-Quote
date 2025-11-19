'use client';
import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
export default function AuthGuard({ children }) {
    var _a;
    const { user, loading } = useAuth();
    const router = useRouter();
    useEffect(() => {
        var _a;
        if (!loading) {
            if (!user) {
                // Not signed in, redirect to auth page
                router.push('/auth');
            }
            else if (!user.emailVerified && ((_a = user.providerData[0]) === null || _a === void 0 ? void 0 : _a.providerId) !== 'google.com') {
                // Email not verified (except for Google users who are auto-verified)
                router.push('/auth');
            }
        }
    }, [user, loading, router]);
    if (loading) {
        return (_jsx("div", { style: {
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5'
            }, children: _jsx("div", { style: { fontSize: '1.5rem' }, children: "Loading..." }) }));
    }
    if (!user || (!user.emailVerified && ((_a = user.providerData[0]) === null || _a === void 0 ? void 0 : _a.providerId) !== 'google.com')) {
        return null; // Will redirect
    }
    return _jsx(_Fragment, { children: children });
}
