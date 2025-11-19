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
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
const notImplemented = () => __awaiter(void 0, void 0, void 0, function* () {
    throw new Error('Use the Fin Quote authentication flow to sign in.');
});
const AuthContext = createContext({
    user: null,
    loading: true,
    signInWithGoogle: notImplemented,
    signInWithEmail: () => __awaiter(void 0, void 0, void 0, function* () { return notImplemented(); }),
    signUpWithEmail: () => __awaiter(void 0, void 0, void 0, function* () { return notImplemented(); }),
    logout: notImplemented,
    resendVerificationEmail: notImplemented,
    getIdToken: () => __awaiter(void 0, void 0, void 0, function* () { return ''; })
});
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
    const supabase = useMemo(() => createClientComponentClient(), []);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let mounted = true;
        supabase.auth.getSession().then(({ data, error }) => {
            var _a, _b;
            if (!mounted)
                return;
            if (error) {
                console.error('[watchlist] Failed to get Supabase session', error);
                setUser(null);
                setLoading(false);
                return;
            }
            setUser((_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : null);
            setLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            var _a;
            setUser((_a = session === null || session === void 0 ? void 0 : session.user) !== null && _a !== void 0 ? _a : null);
            setLoading(false);
        });
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [supabase]);
    const logout = () => __awaiter(this, void 0, void 0, function* () {
        yield supabase.auth.signOut();
    });
    const getIdToken = () => __awaiter(this, void 0, void 0, function* () {
        const { data, error } = yield supabase.auth.getSession();
        if (error)
            throw error;
        if (!data.session) {
            throw new Error('Not authenticated');
        }
        return data.session.access_token;
    });
    const value = {
        user,
        loading,
        signInWithGoogle: notImplemented,
        signInWithEmail: () => __awaiter(this, void 0, void 0, function* () { return notImplemented(); }),
        signUpWithEmail: () => __awaiter(this, void 0, void 0, function* () { return notImplemented(); }),
        logout,
        resendVerificationEmail: notImplemented,
        getIdToken
    };
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
