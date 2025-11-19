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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '@watchlist/lib/firebase/auth-context';
export default function SignInForm({ onSuccess, onSwitchToSignUp }) {
    const { signInWithGoogle, signInWithEmail } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const handleEmailSignIn = (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            yield signInWithEmail(email, password, rememberMe);
            onSuccess === null || onSuccess === void 0 ? void 0 : onSuccess();
        }
        catch (error) {
            setError(error.message);
        }
        finally {
            setLoading(false);
        }
    });
    const handleGoogleSignIn = () => __awaiter(this, void 0, void 0, function* () {
        setError('');
        setLoading(true);
        try {
            yield signInWithGoogle();
            onSuccess === null || onSuccess === void 0 ? void 0 : onSuccess();
        }
        catch (error) {
            setError(error.message);
        }
        finally {
            setLoading(false);
        }
    });
    return (_jsxs("div", { className: "auth-form", style: {
            width: '100%',
            maxWidth: '400px',
            margin: '0 auto',
            padding: '2rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }, children: [_jsx("h2", { style: { marginBottom: '1.5rem', textAlign: 'center', color: 'white' }, children: "Sign In" }), error && (_jsx("div", { style: {
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    background: '#fee',
                    border: '1px solid #fcc',
                    borderRadius: '4px',
                    color: '#c00',
                    fontSize: '0.9rem'
                }, children: error })), _jsxs("form", { onSubmit: handleEmailSignIn, children: [_jsxs("div", { style: { marginBottom: '1rem' }, children: [_jsx("label", { htmlFor: "email", style: { display: 'block', marginBottom: '0.5rem', color: 'white' }, children: "Email" }), _jsx("input", { type: "email", id: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true, style: {
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    fontSize: '1rem',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'white'
                                } })] }), _jsxs("div", { style: { marginBottom: '1rem' }, children: [_jsx("label", { htmlFor: "password", style: { display: 'block', marginBottom: '0.5rem', color: 'white' }, children: "Password" }), _jsx("input", { type: "password", id: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true, style: {
                                    width: '100%',
                                    padding: '0.5rem',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    fontSize: '1rem',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'white'
                                } })] }), _jsx("div", { style: { marginBottom: '1.5rem' }, children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#94a3b8' }, children: [_jsx("input", { type: "checkbox", checked: rememberMe, onChange: (e) => setRememberMe(e.target.checked), style: { marginRight: '0.5rem' } }), "Remember me for 30 days"] }) }), _jsx("button", { type: "submit", disabled: loading, style: {
                            width: '100%',
                            padding: '0.75rem',
                            background: loading ? 'rgba(255, 255, 255, 0.2)' : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            marginBottom: '1rem',
                            boxShadow: loading ? 'none' : '0 4px 6px rgba(59, 130, 246, 0.3)',
                            transition: 'transform 0.2s'
                        }, onMouseEnter: (e) => {
                            if (!loading)
                                e.currentTarget.style.transform = 'translateY(-2px)';
                        }, onMouseLeave: (e) => {
                            if (!loading)
                                e.currentTarget.style.transform = 'translateY(0)';
                        }, children: loading ? 'Signing In...' : 'Sign In' })] }), _jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    margin: '1.5rem 0'
                }, children: [_jsx("div", { style: { flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.2)' } }), _jsx("span", { style: { padding: '0 1rem', color: '#94a3b8' }, children: "OR" }), _jsx("div", { style: { flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.2)' } })] }), _jsxs("button", { onClick: handleGoogleSignIn, disabled: loading, style: {
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.5rem',
                    transition: 'background 0.2s'
                }, onMouseEnter: (e) => {
                    if (!loading)
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }, onMouseLeave: (e) => {
                    if (!loading)
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }, children: [_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", children: [_jsx("path", { fill: "#4285F4", d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" }), _jsx("path", { fill: "#34A853", d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" }), _jsx("path", { fill: "#FBBC05", d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" }), _jsx("path", { fill: "#EA4335", d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" })] }), "Continue with Google"] }), _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("span", { style: { color: '#94a3b8' }, children: "Don't have an account? " }), _jsx("button", { onClick: onSwitchToSignUp, style: {
                            background: 'none',
                            border: 'none',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }, children: "Sign Up" })] })] }));
}
