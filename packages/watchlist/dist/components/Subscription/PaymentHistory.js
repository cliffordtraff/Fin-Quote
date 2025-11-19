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
export default function PaymentHistory({ onCustomerDataLoaded }) {
    const { user, getIdToken } = useAuth();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [customerSince, setCustomerSince] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);
    useEffect(() => {
        if (user) {
            fetchPaymentHistory();
        }
    }, [user]);
    const fetchPaymentHistory = (startingAfter) => __awaiter(this, void 0, void 0, function* () {
        if (!user)
            return;
        const isLoadingMore = !!startingAfter;
        if (isLoadingMore) {
            setLoadingMore(true);
        }
        else {
            setLoading(true);
        }
        setError(null);
        try {
            const token = yield getIdToken();
            const params = new URLSearchParams();
            if (startingAfter) {
                params.append('starting_after', startingAfter);
            }
            params.append('limit', '10');
            const response = yield fetch(`/api/stripe/payment-history?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (!response.ok) {
                throw new Error('Failed to fetch payment history');
            }
            const data = yield response.json();
            if (isLoadingMore) {
                setPayments(prev => [...prev, ...data.payments]);
            }
            else {
                setPayments(data.payments);
                if (data.customer) {
                    setCustomerSince(data.customer.created);
                    onCustomerDataLoaded === null || onCustomerDataLoaded === void 0 ? void 0 : onCustomerDataLoaded(data.customer.created);
                }
            }
            setHasMore(data.hasMore);
        }
        catch (err) {
            console.error('Error fetching payment history:', err);
            setError(err instanceof Error ? err.message : 'Failed to load payment history');
        }
        finally {
            setLoading(false);
            setLoadingMore(false);
        }
    });
    const loadMore = () => {
        if (payments.length > 0) {
            const lastPayment = payments[payments.length - 1];
            fetchPaymentHistory(lastPayment.id);
        }
    };
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };
    const formatCurrency = (amount, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    };
    const getStatusBadge = (status, paid) => {
        if (paid) {
            return (_jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-800", children: "Paid" }));
        }
        const statusColors = {
            'open': 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
            'draft': 'bg-gray-900/30 text-gray-400 border-gray-800',
            'void': 'bg-red-900/30 text-red-400 border-red-800',
            'uncollectible': 'bg-red-900/30 text-red-400 border-red-800',
        };
        const colorClass = statusColors[status] || 'bg-gray-900/30 text-gray-400 border-gray-800';
        return (_jsx("span", { className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`, children: status.charAt(0).toUpperCase() + status.slice(1) }));
    };
    if (loading && payments.length === 0) {
        return (_jsx("div", { className: "bg-[#111] border border-gray-800 rounded-xl p-6", children: _jsxs("div", { className: "animate-pulse", children: [_jsx("div", { className: "h-6 bg-gray-700 rounded w-1/4 mb-4" }), _jsx("div", { className: "space-y-3", children: [1, 2, 3].map(i => (_jsx("div", { className: "h-12 bg-gray-700 rounded" }, i))) })] }) }));
    }
    return (_jsxs("div", { className: "bg-[#111] border border-gray-800 rounded-xl overflow-hidden", children: [_jsxs("button", { onClick: () => setIsExpanded(!isExpanded), className: "w-full px-6 py-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors", children: [_jsx("h3", { className: "text-lg font-semibold text-white", children: "Payment History" }), _jsx("svg", { className: `w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), isExpanded && (_jsxs("div", { className: "px-6 pb-6", children: [error && (_jsx("div", { className: "bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4", children: error })), payments.length === 0 ? (_jsxs("div", { className: "text-center py-8 text-gray-400", children: [_jsx("svg", { className: "w-12 h-12 mx-auto mb-3 text-gray-600", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }) }), _jsx("p", { children: "No payment history yet" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Your payments will appear here after your first billing cycle" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-800", children: [_jsx("th", { className: "text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Date" }), _jsx("th", { className: "text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Description" }), _jsx("th", { className: "text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Amount" }), _jsx("th", { className: "text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Status" }), _jsx("th", { className: "text-left py-3 px-2 text-xs font-medium text-gray-400 uppercase tracking-wider", children: "Invoice" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-800", children: payments.map((payment) => (_jsxs("tr", { className: "hover:bg-gray-900/30 transition-colors", children: [_jsx("td", { className: "py-3 px-2 text-sm text-gray-300", children: formatDate(payment.date) }), _jsxs("td", { className: "py-3 px-2 text-sm text-gray-300", children: [payment.description, payment.number && (_jsxs("span", { className: "text-xs text-gray-500 block", children: ["#", payment.number] }))] }), _jsx("td", { className: "py-3 px-2 text-sm font-medium text-gray-300", children: formatCurrency(payment.amount, payment.currency) }), _jsx("td", { className: "py-3 px-2", children: getStatusBadge(payment.status, payment.paid) }), _jsx("td", { className: "py-3 px-2", children: payment.invoiceUrl && (_jsxs("a", { href: payment.invoiceUrl, target: "_blank", rel: "noopener noreferrer", className: "text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1", children: ["View", _jsx("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" }) })] })) })] }, payment.id))) })] }) }), hasMore && (_jsx("div", { className: "mt-4 text-center", children: _jsx("button", { onClick: loadMore, disabled: loadingMore, className: "text-blue-400 hover:text-blue-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed", children: loadingMore ? 'Loading...' : 'Load More' }) }))] }))] }))] }));
}
