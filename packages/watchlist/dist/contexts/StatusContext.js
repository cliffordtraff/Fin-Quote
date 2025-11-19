'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
const StatusContext = createContext(null);
export function useStatus() {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
}
function StatusMessagePortal({ status, onClose }) {
    const timeoutRef = useRef(null);
    useEffect(() => {
        if (status) {
            // Clear any existing timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            // Set new timeout
            timeoutRef.current = setTimeout(() => {
                onClose();
            }, 3000);
        }
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [status, onClose]);
    if (!status)
        return null;
    const statusElement = (_jsx("div", { style: {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 15px',
            borderRadius: '4px',
            background: status.isError ? '#ffebee' : '#e8f5e9',
            color: status.isError ? '#ff1744' : '#00c853',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: '17px',
            zIndex: 1000,
            display: 'block',
            maxWidth: '300px',
            wordWrap: 'break-word'
        }, children: status.message }));
    // Only render portal if we're in the browser
    if (typeof document !== 'undefined') {
        return createPortal(statusElement, document.body);
    }
    return null;
}
export function StatusProvider({ children }) {
    const [status, setStatus] = useState(null);
    const showStatus = useCallback((message, isError = false) => {
        // Use requestAnimationFrame to batch the status update and prevent flicker
        requestAnimationFrame(() => {
            setStatus({
                message,
                isError,
                id: Date.now().toString()
            });
        });
    }, []);
    const clearStatus = useCallback(() => {
        setStatus(null);
    }, []);
    return (_jsxs(StatusContext.Provider, { value: { showStatus, clearStatus }, children: [children, _jsx(StatusMessagePortal, { status: status, onClose: clearStatus })] }));
}
